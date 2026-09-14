import { config } from "dotenv";
import { resolve } from "node:path";

// Both src/ and dist/ sit two levels below the repository root.
// Existing environment variables (including Docker settings) take precedence.
config({ path: resolve(__dirname, "../../.env") });
