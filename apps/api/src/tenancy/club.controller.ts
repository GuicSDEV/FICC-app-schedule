import { Controller, Get } from "@nestjs/common";
import type { CategoryItem, ClubInfo } from "@ficc/shared";

import { Public } from "../common/auth.decorators";
import { ClubsService } from "./clubs.service";
import { tenant } from "./tenant-context";

@Controller()
export class ClubController {
  constructor(private readonly clubs: ClubsService) {}

  /** The club this deployment serves: name, branding, locale, time zone and rules. */
  @Public()
  @Get("club")
  info(): Promise<ClubInfo> {
    return this.clubs.info(tenant());
  }

  @Get("categories")
  categories(): Promise<CategoryItem[]> {
    return this.clubs.categories();
  }
}
