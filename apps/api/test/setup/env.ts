import { testDatabaseUrl } from "../support/database-url";

// Runs before every test file, before AppModule (and its ConfigModule) is imported.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = "test";
process.env.JOBS_ENABLED = "false";
