import { Global, Module } from "@nestjs/common";

import { Clock } from "./clock";
import { Random } from "./random";

@Global()
@Module({ providers: [Clock, Random], exports: [Clock, Random] })
export class CommonModule {}
