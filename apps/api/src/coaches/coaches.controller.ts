import { Controller, Get, Param } from "@nestjs/common";
import type { CoachProfile } from "@ficc/shared";

import { CoachesService } from "./coaches.service";

@Controller("coaches")
export class CoachesController {
  constructor(private readonly coaches: CoachesService) {}

  @Get(":id")
  profile(@Param("id") id: string): Promise<CoachProfile> {
    return this.coaches.profile(id);
  }
}
