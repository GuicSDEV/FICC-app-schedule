import { Global, Module } from "@nestjs/common";

import { FcmNotificationChannel } from "./fcm.channel";
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
    FcmNotificationChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (
        socket: SocketNotificationChannel,
        push: PushNotificationChannel,
        fcm: FcmNotificationChannel,
      ) => [socket, push, fcm],
      inject: [SocketNotificationChannel, PushNotificationChannel, FcmNotificationChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
