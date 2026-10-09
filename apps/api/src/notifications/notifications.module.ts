import { Global, Module } from "@nestjs/common";

import { NOTIFICATION_CHANNELS } from "./notification-channel";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { SocketNotificationChannel } from "./socket.channel";

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SocketNotificationChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (socket: SocketNotificationChannel) => [socket],
      inject: [SocketNotificationChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
