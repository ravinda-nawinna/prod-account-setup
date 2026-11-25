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

function fontFile() {
	if (process.platform === "win32") {
		return "C\\:/Windows/Fonts/segoeui.ttf";
	}
	return "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
}

function wrapCaption(text, max = 70) {
	const words = text.split(/\s+/).filter(Boolean);
	const lines = [];
	let line = "";
	words.forEach((word) => {
		const next = line ? `${line} ${word}` : word;
		if (next.length > max && line) {
			lines.push(line);
			line = word;
		} else {
			line = next;
		}
	});
	if (line) {
		lines.push(line);
	}
	return lines.join("\n");
}

function ffmpegPathArg(filePath) {
	return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function main() {
	if (!ffmpegPath) {
		throw new Error("ffmpeg-static binary is missing. Run npm install.");
	}
	const list = frames();
	if (list.length === 0) {
		throw new Error("No PNG frames in demo/frames. Run npm run demo:capture first.");
	}
	const segmentDir = path.join(framesDir, "segments");
	fs.rmSync(segmentDir, { recursive: true, force: true });
	fs.mkdirSync(segmentDir, { recursive: true });
	const segmentFiles = [];
	const font = fontFile();
	list.forEach((name, index) => {
		const png = path.join(framesDir, name);
		const txt = path.join(framesDir, `${name}.txt`);
		const caption = fs.existsSync(txt) ? fs.readFileSync(txt, "utf8").trim() : "";
		const burn = path.join(segmentDir, `${name}.burn.txt`);
		fs.writeFileSync(burn, wrapCaption(caption), "utf8");
		const segment = path.join(segmentDir, `${String(index + 1).padStart(2, "0")}.mp4`);
		const draw = [
			`fontfile='${font}'`,
			`textfile='${ffmpegPathArg(burn)}'`,
			"fontsize=19",
			"fontcolor=white",
			"box=1",
			"boxcolor=0x1c2430@0.82",
			"boxborderw=16",
			"x=(w-text_w)/2",
			"y=h-84",
			"line_spacing=8"
		].join(":");
		const vf = `scale=1180:860:flags=lanczos,drawtext=${draw}`;
		const result = spawnSync(ffmpegPath, [
			"-y",
			"-loop", "1",
			"-i", png,
			"-vf", vf,
			"-t", String(seconds),
			"-r", "25",
			"-c:v", "libx264",
			"-pix_fmt", "yuv420p",
			segment
		], { stdio: "inherit" });
		if (result.status !== 0) {
			throw new Error(`ffmpeg failed for ${name}`);
		}
		segmentFiles.push(segment);
	});
	const concat = path.join(segmentDir, "concat.txt");
	fs.writeFileSync(concat, `${segmentFiles.map((file) => `file '${file.replace(/\\/g, "/")}'`).join("\n")}\n`, "utf8");
	const merged = spawnSync(ffmpegPath, [
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", concat,
		"-c", "copy",
		"-movflags", "+faststart",
		outFile
	], { stdio: "inherit" });
	if (merged.status !== 0) {
		throw new Error("ffmpeg merge failed");
	}
	console.log(outFile);
}

main();