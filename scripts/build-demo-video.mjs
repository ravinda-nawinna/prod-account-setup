import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const framesDir = path.join(root, "demo", "frames");
const outFile = path.join(root, "demo", "prod-account-setup-demo.mp4");
const seconds = 4;

function frames() {
	return fs.readdirSync(framesDir)
		.filter((name) => name.endsWith(".png"))
		.sort();
}

function main() {
	if (!ffmpegPath) {
		throw new Error("ffmpeg-static binary is missing. Run npm install.");
	}
	const list = frames();
	if (list.length === 0) {
		throw new Error("No PNG frames in demo/frames. Run npm run demo:capture first.");
	}
	const concat = path.join(framesDir, "concat.txt");
	const lines = list.flatMap((name) => [
		`file '${path.join(framesDir, name).replace(/\\/g, "/")}'`,
		`duration ${seconds}`
	]);
	lines.push(`file '${path.join(framesDir, list[list.length - 1]).replace(/\\/g, "/")}'`);
	fs.writeFileSync(concat, `${lines.join("\n")}\n`, "utf8");
	const result = spawnSync(ffmpegPath, [
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", concat,
		"-vf", "scale=1180:860:flags=lanczos",
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		outFile
	], { stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error("ffmpeg failed");
	}
	console.log(outFile);
}

main();