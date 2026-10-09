import { Prisma } from "../generated/client";

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];
type Data = Record<string, unknown>;

const MODELS = new Map<string, DmmfModel>(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model]),
);

/** Models that belong to a club: every model with a `clubId` column (Club itself excluded). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  [...MODELS.values()]
    .filter((model) => model.fields.some((field) => field.name === "clubId"))
    .map((model) => model.name),
);

/** Thrown when a club-owned model is used outside a tenant context. */
export class MissingTenantError extends Error {
  constructor(model: string, operation: string) {
    super(`No club in context for ${model}.${operation}: run it inside a tenant context.`);
    this.name = "MissingTenantError";
  }
}

const isObject = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

const mapMaybeArray = (value: unknown, map: (item: Data) => Data): unknown =>
  Array.isArray(value)
    ? value.map((item) => map(item as Data))
    : isObject(value)
      ? map(value)
      : value;

/**
 * Adds the club to a create payload and to every nested create of a club-owned model. Prisma
 * accepts either "checked" inputs (to-one relations as `court: { connect }`) or "unchecked" ones
 * (raw foreign keys such as `courtId`), never both. A payload that sets a to-one relation through
 * an owning relation field gets `club: { connect }`; any other payload gets `clubId`. Nested lists
 * of children (`players: { create }`) are valid in both shapes.
 */
function stampCreate(modelName: string, data: Data, clubId: string): Data {
  const model = MODELS.get(modelName);
  if (!model) return data;
  const out: Data = { ...data };
  let checked = false;
  for (const field of model.fields) {
    if (field.kind !== "object" || out[field.name] === undefined) continue;
    if ((field.relationFromFields?.length ?? 0) > 0) checked = true;
    if (isObject(out[field.name]))
      out[field.name] = stampNested(field.type, out[field.name] as Data, clubId);
  }
  if (TENANT_MODELS.has(modelName) && out.clubId === undefined && out.club === undefined) {
    if (checked) out.club = { connect: { id: clubId } };
    else out.clubId = clubId;
  }
  return out;
}

/** Flat rows (createMany): scalars only. */
function stampRow(modelName: string, row: Data, clubId: string): Data {
  return TENANT_MODELS.has(modelName) && row.clubId === undefined ? { ...row, clubId } : row;
}

function stampNested(modelName: string, ops: Data, clubId: string): Data {
  const out: Data = { ...ops };
  if (ops.create !== undefined)
    out.create = mapMaybeArray(ops.create, (item) => stampCreate(modelName, item, clubId));
  if (isObject(ops.createMany)) {
    out.createMany = {
      ...ops.createMany,
      data: mapMaybeArray(ops.createMany.data, (row) => stampRow(modelName, row, clubId)),
    };
  }
  if (ops.connectOrCreate !== undefined) {
    out.connectOrCreate = mapMaybeArray(ops.connectOrCreate, (item) => ({
      ...item,
      create: stampCreate(modelName, item.create as Data, clubId),
    }));
  }
  if (ops.upsert !== undefined) {
    out.upsert = mapMaybeArray(ops.upsert, (item) => ({
      ...item,
      create: stampCreate(modelName, item.create as Data, clubId),
    }));
  }
  return out;
}

const FILTERED = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

/**
 * Prisma client extension that scopes every query on a club-owned model to the club returned by
 * `getClubId`: reads, updates and deletes get `where.clubId`, creates get the club stamped (nested
 * creates included). With no club in context it throws instead of touching every club's rows.
 * Raw SQL ($queryRaw) is not intercepted and must filter by club itself.
 */
export function tenantExtension(getClubId: () => string | undefined) {
  return Prisma.defineExtension({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const clubId = getClubId();
          if (!clubId) throw new MissingTenantError(model, operation);
          const scoped = { ...(args as Data) };
          if (FILTERED.has(operation)) {
            scoped.where = { ...((scoped.where as Data | undefined) ?? {}), clubId };
          } else if (operation === "create") {
            scoped.data = stampCreate(model, scoped.data as Data, clubId);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            scoped.data = mapMaybeArray(scoped.data, (row) => stampRow(model, row, clubId));
          } else if (operation === "upsert") {
            scoped.where = { ...(scoped.where as Data), clubId };
            scoped.create = stampCreate(model, scoped.create as Data, clubId);
          }
          return query(scoped as typeof args);
        },
      },
    },
  });
}
