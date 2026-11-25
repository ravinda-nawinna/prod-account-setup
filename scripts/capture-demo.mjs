import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "demo", "frames");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const clientId = "d86faa30-2a20-4850-b041-bc167bb5abd9";
const demoTtc = "00000000-0000-4000-8000-00000000demo";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugPort(port, tries = 60) {
	for (let i = 0; i < tries; i += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) {
				return await response.json();
			}
		} catch {
			// Electron not ready yet.
		}
		await delay(500);
	}
	throw new Error("Electron remote debugging did not start.");
}

async function shot(page, name, caption) {
	const target = path.join(outDir, name);
	await page.screenshot({ path: target, type: "png" });
	fs.writeFileSync(path.join(outDir, `${name}.txt`), caption, "utf8");
}

async function openCompany(page) {
	await page.click('.stepper li[data-step="company"] button');
	await delay(350);
}

async function fillCredentials(page, tpa) {
	await page.evaluate((values) => {
		document.getElementById("tpa").value = values.tpa;
		document.getElementById("mdmClientId").value = values.clientId;
		document.getElementById("mdmClientSecret").value = "demo-only-not-a-real-secret";
	}, { tpa, clientId });
}

async function checkMdm(page) {
	await page.click("#checkAccount");
	await delay(1100);
}

async function main() {
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	const port = 9333;
	const child = spawn(electronExe, ["."], {
		cwd: root,
		env: {
			...process.env,
			DEMO_MODE: "1",
			ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
		},
		stdio: "ignore",
		windowsHide: false
	});
	const version = await waitForDebugPort(port);
	const browser = await puppeteer.connect({
		browserWSEndpoint: version.webSocketDebuggerUrl,
		defaultViewport: { width: 1180, height: 860 }
	});
	const page = (await browser.pages())[0] || (await browser.newPage());
	await page.waitForSelector("#tpa", { timeout: 15000 });

	await fillCredentials(page, "111111");
	await shot(page, "01-company-111111.png", "Step 1 — Unknown company (111111): enter TPA and MDM credentials, then Check in MDM.");
	await checkMdm(page);
	await shot(page, "02-company-111111-missing.png", "When MDM has no account, copy the message for the MDM team to create it.");

	await openCompany(page);
	await fillCredentials(page, "659592");
	await checkMdm(page);
	await shot(page, "03-tid-659592-choices.png", "Step 2 — Company 659592 has an account but no TID. Choose whether you know the TTC account id.");

	await page.click('input[name="tidChoice"][value="known"]');
	await delay(250);
	await page.evaluate((uuid) => {
		document.getElementById("ttcAccountUuid").value = uuid;
	}, demoTtc);
	await shot(page, "04-tid-known-ttc.png", "Option A — I know the TTC account id: prepare the MDM patch message.");
	await page.click("#patchMessage");
	await delay(700);
	await shot(page, "05-tid-mdm-message.png", "Message for MDM to write the TTC UUID as the account TID.");

	await page.click('input[name="tidChoice"][value="missing"]');
	await delay(250);
	await shot(page, "06-tid-missing-ttc.png", "Option B — TTC account not created yet: raise DEVSERVICE to Team Cotton.");
	await page.click("#cottonMessage");
	await delay(700);
	await shot(page, "07-tid-cotton-message.png", "Message for Team Cotton to create the TTC account.");

	await openCompany(page);
	await fillCredentials(page, "611521");
	await checkMdm(page);
	await shot(page, "08-company-611521-ready.png", "Step 1 — Company 611521: MDM account with TID already set.");
	await page.click('.stepper li[data-step="tid"] button');
	await delay(400);
	await shot(page, "09-tid-611521-set.png", "Account TID is already on the company — continue to People.");
	await page.click('.stepper li[data-step="people"] button');
	await delay(350);
	await page.evaluate(() => {
		document.getElementById("person").value = "ed001ae3-dbb6-4a07-a595-4fe3b0d13490";
	});
	await shot(page, "10-people-check.png", "Step 3 — Check one person by email or Trimble Identity id.");
	await page.click("#checkPeople");
	await delay(800);
	await shot(page, "11-people-result.png", "Green means the user is on the company with an admin relation.");
	await page.click('.stepper li[data-step="subscription"] button');
	await delay(500);
	await page.evaluate(() => {
		document.getElementById("lemCredentials").value = "";
		document.getElementById("lemCredentials").dispatchEvent(new Event("change", { bubbles: true }));
	});
	await delay(700);
	await shot(page, "12-subscription-enable.png", "Step 4 — Subscription: Enable DTD subscription appears when LEM credentials are missing or the account is not licensed yet.");
	await page.evaluate(() => {
		document.getElementById("lemCredentials").value = "ZGVtby1sZW0tY3JlZGVudGlhbHM=";
		document.getElementById("lemCredentials").dispatchEvent(new Event("change", { bubbles: true }));
	});
	await delay(1200);
	await shot(page, "13-subscription-already-licensed.png", "When the account already has an active subscription, Enable is hidden and Yard Documents is linked.");

	await browser.close();
	child.kill();
	console.log(`Captured frames in ${outDir}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});