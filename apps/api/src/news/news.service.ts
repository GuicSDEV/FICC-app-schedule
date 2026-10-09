import { Injectable } from "@nestjs/common";
import { Prisma, Role, UserStatus } from "@ficc/db";
import {
  fromDbDate,
  type NewsPostInput,
  type NewsPostItem,
  toDbDate,
  type UpdateNewsPostInput,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { notFound } from "../common/domain.exception";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const postInclude = (viewerId: string) =>
  ({
    author: { select: { id: true, name: true } },
    reactions: { where: { userId: viewerId }, select: { userId: true } },
    reads: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { reactions: true, reads: true } },
  }) satisfies Prisma.NewsPostInclude;

type PostRow = Prisma.NewsPostGetPayload<{ include: ReturnType<typeof postInclude> }>;

/** Club news board ("Mural"): staff publish, members read and react with a 👍. */
@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Pinned posts first, then the newest. */
  async list(viewer: RequestUser, limit = 30): Promise<NewsPostItem[]> {
    const rows = await this.prisma.newsPost.findMany({
      where: { deletedAt: null },
      include: postInclude(viewer.id),
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: limit,
    });
    return rows.map((row) => this.toItem(row, viewer));
  }

  async create(author: RequestUser, input: NewsPostInput): Promise<NewsPostItem> {
    const row = await this.prisma.newsPost.create({
      data: {
        title: input.title,
        body: input.body,
        photoUrls: input.photoUrls,
        eventDate: input.eventDate ? toDbDate(input.eventDate) : null,
        pinned: input.pinned,
        authorId: author.id,
        publishedAt: this.clock.now(),
      },
      include: postInclude(author.id),
    });
    if (input.notify) {
      const members = await this.prisma.user.findMany({
        where: { role: Role.MEMBER, isActive: true, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      await this.notifications.notify(
        members.map((member) => member.id),
        "NEWS_POSTED",
        { postId: row.id, title: row.title, authorName: author.name },
      );
    }
    this.realtime.newsUpdated({ postId: row.id });
    return this.toItem(row, author);
  }

  async update(viewer: RequestUser, id: string, input: UpdateNewsPostInput): Promise<NewsPostItem> {
    await this.load(id);
    const row = await this.prisma.newsPost.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.photoUrls !== undefined ? { photoUrls: input.photoUrls } : {}),
        ...(input.eventDate !== undefined
          ? { eventDate: input.eventDate ? toDbDate(input.eventDate) : null }
          : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      },
      include: postInclude(viewer.id),
    });
    this.realtime.newsUpdated({ postId: id });
    return this.toItem(row, viewer);
  }

  async remove(id: string): Promise<void> {
    await this.load(id);
    await this.prisma.newsPost.update({ where: { id }, data: { deletedAt: this.clock.now() } });
    this.realtime.newsUpdated({ postId: id });
  }

  /** Toggles the viewer's 👍. */
  async react(viewer: RequestUser, id: string): Promise<NewsPostItem> {
    await this.load(id);
    const existing = await this.prisma.newsReaction.findUnique({
      where: { postId_userId: { postId: id, userId: viewer.id } },
    });
    if (existing) {
      await this.prisma.newsReaction.delete({
        where: { postId_userId: { postId: id, userId: viewer.id } },
      });
    } else {
      await this.prisma.newsReaction.create({ data: { postId: id, userId: viewer.id } });
    }
    return this.get(viewer, id);
  }

  async markRead(viewer: RequestUser, id: string): Promise<void> {
    await this.load(id);
    await this.prisma.newsRead.upsert({
      where: { postId_userId: { postId: id, userId: viewer.id } },
      create: { postId: id, userId: viewer.id },
      update: {},
    });
  }

  private async get(viewer: RequestUser, id: string): Promise<NewsPostItem> {
    const row = await this.prisma.newsPost.findUniqueOrThrow({
      where: { id },
      include: postInclude(viewer.id),
    });
    return this.toItem(row, viewer);
  }

  private async load(id: string) {
    const post = await this.prisma.newsPost.findFirst({ where: { id, deletedAt: null } });
    if (!post) throw notFound("NEWS_NOT_FOUND", "api.newsNotFound");
    return post;
  }

  private toItem(row: PostRow, viewer: RequestUser): NewsPostItem {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      photoUrls: row.photoUrls,
      eventDate: row.eventDate ? fromDbDate(row.eventDate) : null,
      pinned: row.pinned,
      author: row.author,
      publishedAt: row.publishedAt.toISOString(),
      reactions: row._count.reactions,
      reactedByMe: row.reactions.length > 0,
      readByMe: row.reads.length > 0,
      readCount: can(viewer, "NEWS_MANAGE") ? row._count.reads : null,
    };
  }
}
