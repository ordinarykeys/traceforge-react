import { generateExportArtifact, type ExportTarget } from "../src/lib/crypto";
import { buildCryptoRegressionSamples } from "./_cryptoRegressionFixtures";
import { installLocalPackageFetch } from "./_cryptoRegressionSupport";

const exportTargets: ExportTarget[] = ["js_source", "easy_module"];
const easyLanguageHeaderPattern = /^\.(?:版本|鐗堟湰) 2/m;

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main() {
  installLocalPackageFetch();

  const samples = await buildCryptoRegressionSamples();
  const failures: Array<{ name: string; error: string }> = [];
  let count = 0;

  for (const sample of samples) {
    for (const target of exportTargets) {
      const caseName = `${sample.name}:${target}`;

      try {
        const artifact = await generateExportArtifact(sample.params, target);
        count += 1;

        assert(artifact.title.trim().length > 0, `${caseName} missing title`);
        assert(artifact.summary.trim().length > 0, `${caseName} missing summary`);
        assert(artifact.content.trim().length > 0, `${caseName} missing content`);

        if (target === "js_source") {
          assert(artifact.language === "javascript", `${caseName} expected javascript language`);
          assert(
            !artifact.content.includes("Unsupported self-contained code generation"),
            `${caseName} returned unsupported placeholder script`,
          );
        }

        if (target === "easy_module") {
          assert(artifact.language === "plaintext", `${caseName} expected plaintext language`);
          assert(Boolean(artifact.entryName), `${caseName} missing entryName`);
          assert(easyLanguageHeaderPattern.test(artifact.content), `${caseName} missing EasyLanguage header`);
          assert(
            artifact.entryName ? artifact.content.includes(artifact.entryName) : false,
            `${caseName} missing exported entryName in content`,
          );
          assert(!artifact.summary.includes("Pending"), `${caseName} unexpectedly fell back to pending state`);
        }

        console.log(`PASS ${caseName}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: caseName, error: message });
        console.error(`FAIL ${caseName}`);
        console.error(message);
      }
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} export regression case(s) failed`);
  }

  console.log(`All export artifact cases passed (${count})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
