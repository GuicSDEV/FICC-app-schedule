// The only entry point to the database. Apps import from "@ficc/db", never from
// "@prisma/client" or the generated folder directly. It re-exports the generated, fully typed
// client: `PrismaClient`, the `Prisma` namespace (input types, `Prisma.TransactionClient`,
// error classes), every model type and every enum.
export * from "../generated/client";
