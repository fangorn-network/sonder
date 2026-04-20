import { parseFile } from "music-metadata";
import { readdirSync, statSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const IA_DATA_DIR = "./ia-data";
const BUCKET_NAME = "my-first-bucket";
const R2_PREFIX = "my-first-dir";
const WORKER_URL = "https://fangorn-access-worker.quickbeam.workers.dev";
const R2_ACCOUNT_ID = "2e0a41ed3fec719d427dfae6512efddf";
const R2_PROFILE = "r2";

function uploadToR2() {
  if (!R2_ACCOUNT_ID) {
    throw new Error("R2_ACCOUNT_ID env var is required");
  }
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  console.log(`\nUploading ${IA_DATA_DIR} to R2 bucket: ${BUCKET_NAME}...`);
  execSync(
    `aws --profile ${R2_PROFILE} --endpoint-url ${endpoint} s3 sync ${IA_DATA_DIR} s3://${BUCKET_NAME}/${R2_PREFIX}/`,
    { stdio: "inherit" }
  );
  console.log("Upload complete.\n");
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function buildPublishRecords(dir) {
  const records = [];

  const items = readdirSync(dir);
  for (const item of items) {
    const itemPath = join(dir, item);
    if (!statSync(itemPath).isDirectory()) continue;

    const files = readdirSync(itemPath).filter((f) => f.endsWith(".mp3"));
    for (const file of files) {
      const filePath = join(itemPath, file);
      const fileName = basename(file);
      const r2Uri = `r2://${R2_PREFIX}/${item}/${fileName}`;

      let meta = {};
      try {
        const { common } = await parseFile(filePath);
        meta = common;
      } catch (e) {
        console.warn(`  [warn] could not parse metadata for ${filePath}: ${e.message}`);
      }

      const name = slugify(meta.title || fileName.replace(".mp3", ""));

      records.push({
        name,
        fields: {
          title: meta.title ?? fileName.replace(".mp3", ""),
          artist: meta.artist ?? "Unknown Artist",
          album: meta.album ?? "Unknown Album",
          trackNumber: meta.track?.no?.toString() ?? "0",
          genre: meta.genre?.[0] ?? "Unknown",
          duration: meta.duration ? Math.round(meta.duration).toString() : "0",
          image: "",
          audio: {
            "@type": "handle",
            uri: r2Uri,
            workerUrl: WORKER_URL,
          },
        },
      });

      console.log(`  [ok] ${name} → ${r2Uri}`);
    }
  }

  return records;
}

uploadToR2();
const records = await buildPublishRecords(IA_DATA_DIR);
writeFileSync("./data.json", JSON.stringify(records, null, 2));
console.log(`\nWrote ${records.length} records to data.json`);