#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { openAsBlob } from "node:fs";

const [, , command, ...args] = process.argv;

function buildHeaders() {
  const headers = new Headers();

  if (process.env.BACKUP_BEARER_TOKEN) {
    headers.set("Authorization", `Bearer ${process.env.BACKUP_BEARER_TOKEN}`);
  }

  if (process.env.BACKUP_HEADER_NAME && process.env.BACKUP_HEADER_VALUE) {
    headers.set(process.env.BACKUP_HEADER_NAME, process.env.BACKUP_HEADER_VALUE);
  }

  return headers;
}

async function download(url, destination) {
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`download failed (${response.status} ${response.statusText}) ${text}`.trim());
  }

  await new Promise((resolve, reject) => {
    const output = createWriteStream(destination);
    response.body.pipeTo(
      new WritableStream({
        write(chunk) {
          output.write(chunk);
        },
        close() {
          output.end();
          resolve();
        },
        abort(error) {
          output.destroy(error);
          reject(error);
        },
      }),
    ).catch((error) => {
      output.destroy(error);
      reject(error);
    });
  });
}

async function restore(url, target, mode, filePath) {
  const form = new FormData();
  form.set("target", target);
  form.set("mode", mode);
  form.set("file", await openAsBlob(filePath), basename(filePath));

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`restore failed (${response.status} ${response.statusText}) ${text}`.trim());
  }

  if (text) {
    process.stdout.write(text);
    if (!text.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
}

try {
  if (command === "download") {
    if (args.length !== 2) {
      throw new Error("usage: backup-http.mjs download <url> <destination>");
    }
    await download(args[0], args[1]);
  } else if (command === "restore") {
    if (args.length !== 4) {
      throw new Error("usage: backup-http.mjs restore <url> <target> <mode> <file>");
    }
    await restore(args[0], args[1], args[2], args[3]);
  } else {
    throw new Error("usage: backup-http.mjs <download|restore> ...");
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
