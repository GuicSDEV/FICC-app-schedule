"use client";

import { useSession } from "@/components/providers/session-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function AreaHome() {
  const { user } = useSession();
  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle="Área do professor"
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/coach/profile" />
          </>
        }
      />
      <Card className="mt-6">
        <CardContent>
          <p className="font-display text-title font-semibold">Olá, {user?.name.split(" ")[0]}</p>
        </CardContent>
      </Card>
    </>
  );
}
