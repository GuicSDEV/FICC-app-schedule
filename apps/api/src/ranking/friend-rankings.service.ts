import { Injectable } from "@nestjs/common";
import { MatchStatus, Role } from "@ficc/db";
import {
  type AddFriendRankingMembersInput,
  addDays,
  clubToday,
  type CreateFriendRankingInput,
  FRIEND_RANKING_MAX_MEMBERS,
  type FriendRankingDetail,
  type FriendRankingEntry,
  type FriendRankingSummary,
  type IsoDate,
  toDbDate,
  type UpdateFriendRankingInput,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { forbidden, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

/** Private rankings one member may own. */
const MAX_OWNED = 10;

const pct = (wins: number, matches: number) =>
  matches === 0 ? 0 : Math.round((wins / matches) * 100);

type RankingRow = NonNullable<Awaited<ReturnType<FriendRankingsService["load"]>>>;

/**
 * Private rankings among friends: who won the most matches in a month (or since the ranking was
 * created), counting every match each one plays or only the matches among them. Only its members
 * see it; the owner manages it and anyone can leave.
 */
@Injectable()
export class FriendRankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** The viewer's rankings (owned or joined), with their place and the leader. */
  async mine(userId: string): Promise<FriendRankingSummary[]> {
    const rankings = await this.prisma.friendRanking.findMany({
      where: { members: { some: { userId } } },
      include: this.include(),
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      rankings.map(async (ranking) => {
        const { entries } = await this.table(ranking, null);
        const mine = entries.find((entry) => entry.player.id === userId);
        const leader = entries[0] && entries[0].wins > 0 ? entries[0].player : null;
        return {
          id: ranking.id,
          name: ranking.name,
          scope: ranking.scope,
          period: ranking.period,
          ownerId: ranking.ownerId,
          members: ranking.members.length,
          myRank: mine && mine.matches > 0 ? mine.rank : null,
          leader,
        };
      }),
    );
  }

  async detail(userId: string, id: string, month?: string): Promise<FriendRankingDetail> {
    const ranking = await this.visible(userId, id);
    const { entries, month: shown } = await this.table(ranking, month ?? null);
    return {
      id: ranking.id,
      name: ranking.name,
      scope: ranking.scope,
      period: ranking.period,
      ownerId: ranking.ownerId,
      createdAt: ranking.createdAt.toISOString(),
      month: shown,
      entries,
    };
  }

  async create(userId: string, input: CreateFriendRankingInput): Promise<FriendRankingDetail> {
    const owned = await this.prisma.friendRanking.count({ where: { ownerId: userId } });
    if (owned >= MAX_OWNED) {
      throw unprocessable("FRIEND_RANKING_LIMIT", {
        key: "api.friendRankingLimit",
        params: { max: MAX_OWNED },
      });
    }
    const friends = await this.members(input.memberIds.filter((id) => id !== userId));
    const ranking = await this.prisma.friendRanking.create({
      data: {
        ownerId: userId,
        name: input.name,
        scope: input.scope,
        period: input.period,
        members: {
          create: [{ userId }, ...friends.map((friend) => ({ userId: friend.id }))],
        },
      },
    });
    await this.tell(
      friends.map((friend) => friend.id),
      ranking.id,
      ranking.name,
      userId,
    );
    return this.detail(userId, ranking.id);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateFriendRankingInput,
  ): Promise<FriendRankingDetail> {
    await this.owned(userId, id);
    await this.prisma.friendRanking.update({
      where: { id },
      data: { name: input.name, scope: input.scope, period: input.period },
    });
    return this.detail(userId, id);
  }

  async addMembers(
    userId: string,
    id: string,
    input: AddFriendRankingMembersInput,
  ): Promise<FriendRankingDetail> {
    const ranking = await this.owned(userId, id);
    const current = new Set(ranking.members.map((member) => member.userId));
    const friends = await this.members(input.userIds.filter((other) => !current.has(other)));
    if (current.size + friends.length > FRIEND_RANKING_MAX_MEMBERS) {
      throw unprocessable("FRIEND_RANKING_FULL", {
        key: "api.friendRankingFull",
        params: { max: FRIEND_RANKING_MAX_MEMBERS },
      });
    }
    await this.prisma.friendRankingMember.createMany({
      data: friends.map((friend) => ({ rankingId: id, userId: friend.id })),
      skipDuplicates: true,
    });
    await this.tell(
      friends.map((friend) => friend.id),
      id,
      ranking.name,
      userId,
    );
    return this.detail(userId, id);
  }

  /** The owner takes someone out, or a member leaves. The owner leaving deletes it. */
  async removeMember(userId: string, id: string, memberId: string): Promise<void> {
    const ranking = await this.visible(userId, id);
    if (memberId !== userId && ranking.ownerId !== userId) {
      throw forbidden("FRIEND_RANKING_OWNER_ONLY", "api.friendRankingOwnerOnly");
    }
    if (memberId === ranking.ownerId) {
      await this.prisma.friendRanking.delete({ where: { id } });
      return;
    }
    await this.prisma.friendRankingMember.deleteMany({
      where: { rankingId: id, userId: memberId },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.friendRanking.delete({ where: { id } });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private include() {
    return {
      members: { include: { user: { select: playerSelect() } } },
    } as const;
  }

  load(id: string) {
    return this.prisma.friendRanking.findFirst({ where: { id }, include: this.include() });
  }

  /** Only its members see a ranking (others get "not found"). */
  private async visible(userId: string, id: string): Promise<RankingRow> {
    const ranking = await this.load(id);
    if (!ranking || !ranking.members.some((member) => member.userId === userId)) {
      throw notFound("FRIEND_RANKING_NOT_FOUND", "api.friendRankingNotFound");
    }
    return ranking;
  }

  private async owned(userId: string, id: string): Promise<RankingRow> {
    const ranking = await this.visible(userId, id);
    if (ranking.ownerId !== userId) {
      throw forbidden("FRIEND_RANKING_OWNER_ONLY", "api.friendRankingOwnerOnly");
    }
    return ranking;
  }

  /** Active members among these ids (others are ignored). */
  private members(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: ids }, role: Role.MEMBER, isActive: true },
      select: { id: true },
    });
  }

  private async tell(userIds: string[], rankingId: string, rankingName: string, by: string) {
    if (userIds.length === 0) return;
    const owner = await this.prisma.user.findUnique({ where: { id: by }, select: { name: true } });
    await this.notifications.notify(userIds, "FRIEND_RANKING_ADDED", {
      rankingId,
      rankingName,
      addedBy: owner?.name ?? "",
    });
  }

  /** The table for a month ("YYYY-MM", this month by default) or since the ranking began. */
  private async table(
    ranking: RankingRow,
    month: string | null,
  ): Promise<{ entries: FriendRankingEntry[]; month: string | null }> {
    const zone = clubTimeZone();
    let from: IsoDate;
    let to: IsoDate | null = null;
    let shown: string | null = null;
    if (ranking.period === "MONTHLY") {
      shown = month ?? clubToday(this.clock.now(), zone).slice(0, 7);
      from = `${shown}-01` as IsoDate;
      const [year, monthNumber] = shown.split("-").map(Number) as [number, number];
      to = (
        monthNumber === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`
      ) as IsoDate;
    } else {
      from = clubToday(ranking.createdAt, zone);
      to = addDays(clubToday(this.clock.now(), zone), 1);
    }
    const memberIds = new Set(ranking.members.map((member) => member.userId));
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        sport: clubSettings().primarySport,
        playedOn: { gte: toDbDate(from), lt: toDbDate(to) },
        players: { some: { userId: { in: [...memberIds] } } },
      },
      select: { winnerSide: true, players: { select: { userId: true, side: true } } },
    });
    const tally = new Map<string, { wins: number; matches: number }>();
    for (const match of matches) {
      // Head to head only: every player of the match must be in the ranking.
      if (
        ranking.scope === "AMONG_MEMBERS" &&
        match.players.some((player) => !memberIds.has(player.userId))
      ) {
        continue;
      }
      for (const player of match.players) {
        if (!memberIds.has(player.userId)) continue;
        const row = tally.get(player.userId) ?? { wins: 0, matches: 0 };
        row.matches += 1;
        if (player.side === match.winnerSide) row.wins += 1;
        tally.set(player.userId, row);
      }
    }
    const rows = ranking.members.map((member) => {
      const row = tally.get(member.userId) ?? { wins: 0, matches: 0 };
      return {
        player: toPlayerSummary(member.user),
        wins: row.wins,
        losses: row.matches - row.wins,
        matches: row.matches,
        winRate: pct(row.wins, row.matches),
      };
    });
    rows.sort(
      (a, b) =>
        b.wins - a.wins ||
        b.winRate - a.winRate ||
        a.losses - b.losses ||
        a.player.name.localeCompare(b.player.name),
    );
    const entries: FriendRankingEntry[] = [];
    rows.forEach((row, index) => {
      const previous = entries[index - 1];
      const tied =
        previous !== undefined && previous.wins === row.wins && previous.winRate === row.winRate;
      entries.push({ ...row, rank: tied ? previous.rank : index + 1 });
    });
    return { entries, month: shown };
  }
}
