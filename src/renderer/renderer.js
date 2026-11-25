const fields = ["tpa", "ttcAccountUuid", "mdmClientId", "mdmClientSecret", "lemCredentials", "userAccessToken", "person"];

let account = null;
let current = "company";

function value(id) {
	return document.getElementById(id).value.trim();
}

function readForm() {
	const input = { users: [], tpAdminConfirmed: true };
	fields.forEach((id) => {
		input[id] = value(id);
	});
	input.userAccessToken = input.userAccessToken.replace(/^Bearer\s+/i, "");
	if (account) {
		input.accountTrn = account.accountTrn || "";
		input.accountName = account.accountName || "";
	}
	return input;
}

function showChoice() {
	const known = document.querySelector('input[name="tidChoice"]:checked').value === "known";
	document.getElementById("knownTtc").hidden = !known;
	document.getElementById("missingTtc").hidden = known;
}

function showResult(containerId, result) {
	const container = document.getElementById(containerId);
	container.replaceChildren();
	if (!result) {
		return;
	}
	if (!result.ok) {
		const error = document.createElement("p");
		error.className = "error";
		error.textContent = result.error;
		container.appendChild(error);
		return;
	}
	const cards = result.steps || [result];
	cards.forEach((item) => {
		if (!item.detail && !item.message && !(item.lines && item.lines.length)) {
			return;
		}
		const card = document.createElement("article");
		card.className = `result ${item.state || (item.found ? "ready" : "waiting")}`;
		const lines = item.lines && item.lines.length ? item.lines : (item.detail ? [item.detail] : []);
		lines.forEach((line) => appendFact(card, line));
		const message = item.message || item.cotton;
		if (message) {
			const text = document.createElement("pre");
			text.textContent = message;
			const copy = document.createElement("button");
			copy.type = "button";
			copy.className = "ghost";
			copy.textContent = "Copy message";
			copy.addEventListener("click", () => navigator.clipboard.writeText(message));
			card.append(text, copy);
		}
		container.appendChild(card);
	});
}

function go(step) {
	current = step;
	document.querySelectorAll("[data-panel]").forEach((panel) => {
		panel.hidden = panel.dataset.panel !== step;
	});
	document.querySelectorAll(".stepper li").forEach((item) => {
		item.classList.toggle("current", item.dataset.step === step);
		item.classList.toggle("done", stepDone(item.dataset.step));
	});
	if (step === "subscription" && account && account.hasTid) {
		refreshSubscription();
	}
	if (step === "tid" && account && account.hasTid) {
		document.getElementById("tidIntro").textContent = `TID ${account.tid} is already on the account. Continue to People.`;
	}
	if (step === "tid" && account && account.found && !account.hasTid) {
		document.getElementById("tidIntro").textContent = "The MDM account exists, and it has no TID. The TID has to be the TTC account id.";
	}
	syncTidForm();
}

const FACT_LABELS = ["Account name", "Account TRN", "Subscription", "Relation", "User id", "Status", "Email", "Name", "Plan", "TPA", "TID"];

function appendFact(parent, line) {
	const row = document.createElement("p");
	const label = FACT_LABELS.find((item) => line === item || line.startsWith(`${item} `));
	if (!label) {
		row.textContent = line;
		parent.appendChild(row);
		return;
	}
	const strong = document.createElement("strong");
	strong.textContent = label;
	row.appendChild(strong);
	const rest = line.slice(label.length).trim();
	if (rest) {
		row.appendChild(document.createTextNode(` ${rest}`));
	}
	parent.appendChild(row);
}

function fillLines(element, lines) {
	element.replaceChildren();
	(lines || []).filter(Boolean).forEach((line) => appendFact(element, line));
}

const YARD_DOCUMENTS = "https://yarddocuments.eu.trimble-transportation.com/";

function renderSubscriptionBox(extraLines, licensed) {
	const box = document.getElementById("subscriptionFacts");
	box.hidden = false;
	box.className = "result ready";
	const lines = account && account.lines ? [...account.lines] : [];
	if (!licensed && account && account.hasTid) {
		lines.push("The account TID is set, so this company can be licensed.");
	}
	(extraLines || []).filter((line) => line && line !== "Already licensed. Leave this subscription.").forEach((line) => lines.push(line));
	fillLines(box, lines);
	if (!licensed) {
		return;
	}
	const row = document.createElement("p");
	row.appendChild(document.createTextNode("This account already has an active subscription. Now you can access "));
	const link = document.createElement("a");
	link.href = YARD_DOCUMENTS;
	link.target = "_blank";
	link.rel = "noreferrer";
	link.textContent = YARD_DOCUMENTS;
	row.appendChild(link);
	box.appendChild(row);
}

async function refreshSubscription() {
	const button = document.getElementById("licenseButton");
	const showEnable = (visible) => {
		button.hidden = !visible;
		button.closest(".actions").hidden = !visible;
	};
	if (!value("lemCredentials")) {
		renderSubscriptionBox([], false);
		showEnable(true);
		return;
	}
	const result = await window.setupApp.readSubscription(await persist());
	if (!result.ok) {
		renderSubscriptionBox([result.error], false);
		showEnable(true);
		return;
	}
	renderSubscriptionBox(result.lines, Boolean(result.active));
	showEnable(!result.active);
}

function syncTidForm() {
	const pending = Boolean(account && account.found && !account.hasTid);
	document.querySelector(".choices").hidden = !pending;
	document.getElementById("recheck").closest(".actions").hidden = !pending;
	if (!pending) {
		document.getElementById("knownTtc").hidden = true;
		document.getElementById("missingTtc").hidden = true;
		return;
	}
	showChoice();
}

function stepDone(step) {
	if (!account || !account.found) {
		return false;
	}
	if (step === "company") {
		return true;
	}
	if (step === "tid") {
		return account.hasTid;
	}
	return false;
}

function stepAllowed(step) {
	if (step === "company") {
		return true;
	}
	if (!account || !account.found) {
		return false;
	}
	if (step === "tid") {
		return true;
	}
	return account.hasTid;
}

function applyAccount(result) {
	if (!result.ok) {
		showResult("companyResult", result);
		return;
	}
	account = result;
	if (!result.found) {
		showResult("companyResult", result);
		go("company");
		return;
	}
	showResult("companyResult", { ok: true, lines: result.lines, state: "ready" });
	if (result.hasTid) {
		go("people");
		return;
	}
	go("tid");
}

async function persist() {
	const input = readForm();
	await window.setupApp.saveSettings(input);
	return input;
}

async function run(containerId, action) {
	const buttons = [...document.querySelectorAll("button")];
	buttons.forEach((button) => { button.disabled = true; });
	try {
		const input = await persist();
		const result = await action(input);
		if (result) {
			showResult(containerId, result);
			return result;
		}
	} catch (error) {
		showResult(containerId, { ok: false, error: error.message });
	} finally {
		buttons.forEach((button) => { button.disabled = false; });
		document.querySelectorAll(".stepper li").forEach((item) => {
			item.querySelector("button").disabled = !stepAllowed(item.dataset.step);
		});
	}
	return null;
}

document.querySelectorAll(".stepper li").forEach((item) => {
	item.querySelector("button").addEventListener("click", () => {
		if (stepAllowed(item.dataset.step)) {
			go(item.dataset.step);
		}
	});
});
document.querySelectorAll('input[name="tidChoice"]').forEach((input) => input.addEventListener("change", showChoice));
document.getElementById("checkAccount").addEventListener("click", () => run("companyResult", async (input) => {
	const result = await window.setupApp.checkAccount(input);
	applyAccount(result);
	return null;
}));
document.getElementById("recheck").addEventListener("click", () => run("tidResult", async (input) => {
	const result = await window.setupApp.checkAccount(input);
	applyAccount(result);
	return null;
}));
document.getElementById("cottonMessage").addEventListener("click", () => run("tidResult", async (input) => {
	if (!account || !account.cotton) {
		return { ok: false, error: "Check the company in MDM first." };
	}
	return { ok: true, state: "waiting", detail: "Send this to Team Cotton.", message: account.cotton };
}));
document.getElementById("patchMessage").addEventListener("click", () => run("tidResult", async (input) => {
	const result = await window.setupApp.tidMessage(input);
	if (!result.ok) {
		return result;
	}
	return { ok: true, state: "waiting", detail: "Send this to MDM. They write the TTC account id as the TID. Then check MDM again.", message: result.message };
}));
document.getElementById("lemCredentials").addEventListener("change", () => {
	if (current === "subscription") {
		refreshSubscription();
	}
});
document.getElementById("licenseButton").addEventListener("click", () => run("subscriptionResult", async (input) => {
	const confirmed = window.confirm(`Enable the Digital Transport Documents subscription for company ${input.tpa}? An existing active subscription is left as it is.`);
	if (!confirmed) {
		return null;
	}
	const result = await window.setupApp.enableSubscription(input);
	await refreshSubscription();
	return result;
}));
document.getElementById("signInButton").addEventListener("click", () => run("subscriptionResult", (input) => window.setupApp.checkSignIn(input)));
document.getElementById("checkPeople").addEventListener("click", () => run("peopleResult", (input) => window.setupApp.checkPerson(input)));

window.setupApp.loadSettings().then((saved) => {
	fields.forEach((id) => {
		if (saved && saved[id]) {
			document.getElementById(id).value = saved[id];
		}
	});
	showChoice();
	go("company");
});
