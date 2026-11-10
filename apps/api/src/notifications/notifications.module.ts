import { Global, Module } from "@nestjs/common";

import { NOTIFICATION_CHANNELS } from "./notification-channel";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushNotificationChannel } from "./push.channel";
import { PushController } from "./push.controller";
import { SocketNotificationChannel } from "./socket.channel";

@Global()
@Module({
  controllers: [NotificationsController, PushController],
  providers: [
    NotificationsService,
    SocketNotificationChannel,
    PushNotificationChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (socket: SocketNotificationChannel, push: PushNotificationChannel) => [
        socket,
        push,
      ],
      inject: [SocketNotificationChannel, PushNotificationChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
