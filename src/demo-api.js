const TPA_READY = "611521";
const TPA_MISSING_TID = "659592";
const TPA_UNKNOWN = "111111";

const DEMO_TRN = "trn:ttc:ctp-mdm:eu:prod:accounts:a9737fa3-ed28-4725-9536-0dea3d9eb02d";
const DEMO_TID = "54cefbf7-f69e-4016-82e7-5bf29cad4087";
const DEMO_SUBSCRIPTION = "9f1ad74f-a212-44d7-a6b6-ce69c354ee3e";
const MISSING_TRN = "trn:ttc:ctp-mdm:eu:prod:accounts:0431ac0c-c581-4b1c-9235-825c60e69f4c";

function tpAdminUrl(tpa) {
	return `https://tpadmin.transporeon.nil/company/${tpa}`;
}

function createAccountMessage(input) {
	return [
		"Please create this production MDM account.",
		"",
		`TPA: ${input.tpa}`,
		`TP Admin: ${tpAdminUrl(input.tpa)}`,
		"",
		"Send back the account TRN, the status, and the TPA and TID references."
	].join("\n");
}

function cottonMessage(input) {
	return [
		"Please migrate this Transporeon company to a TTC account.",
		"",
		`TPA: ${input.tpa}`,
		`TP Admin: ${tpAdminUrl(input.tpa)}`,
		"",
		"The new TTC account UUID must be written to the MDM account as TID."
	].join("\n");
}

function tidPatchMessage(input, accountTrn, ttcAccountUuid, accountName) {
	const label = accountName ? `${accountName}, TPA ${input.tpa}` : `TPA ${input.tpa}`;
	return [
		`Please set external reference TID on MDM account ${accountTrn} (${label}) to the TTC account UUID ${ttcAccountUuid}.`,
		`Leave TPA as ${input.tpa}.`,
		"Send back the account TRN and confirm both references when done."
	].join("\n");
}

function readyAccount() {
	const lines = [
		"Account name Central Demo Environment",
		`Account TRN ${DEMO_TRN}`,
		"Status ACTIVE",
		`TPA ${TPA_READY}`,
		`TID ${DEMO_TID}`
	];
	return {
		ok: true,
		found: true,
		hasTid: true,
		accountTrn: DEMO_TRN,
		accountName: "Central Demo Environment",
		status: "ACTIVE",
		tpaRef: TPA_READY,
		tid: DEMO_TID,
		detail: lines.join(". "),
		lines,
		cotton: cottonMessage({ tpa: TPA_READY })
	};
}

function missingTidAccount(input) {
	const lines = [
		"Account name Mateusz Turajski",
		`Account TRN ${MISSING_TRN}`,
		"Status ACTIVE",
		`TPA ${TPA_MISSING_TID}`,
		"TID missing"
	];
	return {
		ok: true,
		found: true,
		hasTid: false,
		accountTrn: MISSING_TRN,
		accountName: "Mateusz Turajski",
		status: "ACTIVE",
		tpaRef: TPA_MISSING_TID,
		tid: "",
		detail: lines.join(". "),
		lines,
		cotton: cottonMessage(input)
	};
}

async function checkAccount(input) {
	if (!input.tpa) {
		return { ok: false, error: "Enter the company number from TP Admin." };
	}
	if (input.tpa === TPA_UNKNOWN) {
		return {
			ok: true,
			found: false,
			hasTid: false,
			detail: "MDM has no account for this company number.",
			message: createAccountMessage(input)
		};
	}
	if (input.tpa === TPA_MISSING_TID) {
		return missingTidAccount(input);
	}
	if (input.tpa === TPA_READY) {
		return readyAccount();
	}
	return {
		ok: true,
		found: false,
		hasTid: false,
		detail: "MDM has no account for this company number.",
		message: createAccountMessage(input)
	};
}

function tidMessage(input) {
	if (!input.ttcAccountUuid) {
		return { ok: false, error: "Enter the TTC account id." };
	}
	if (!input.accountTrn) {
		return { ok: false, error: "Check the company in MDM first." };
	}
	return {
		ok: true,
		message: tidPatchMessage(input, input.accountTrn, input.ttcAccountUuid, input.accountName)
	};
}

async function checkSetup() {
	return { ok: true, steps: [] };
}

async function checkPerson(input) {
	if (input.tpa !== TPA_READY) {
		return { ok: true, state: "blocked", lines: ["Complete the Company and Account TID steps for company 611521 first."] };
	}
	const person = (input.person || "").trim();
	if (!person) {
		return { ok: false, error: "Enter an email or a Trimble Identity id." };
	}
	const lines = [
		"On this company.",
		"Name Benjamin Vanzetta",
		"Email benjamin_vanzetta@trimble.com",
		"User id trn:ttc:ctp-mdm:eu:prod:users:1b9919ad-3efc-493e-889e-9c245074833d",
		"TID ed001ae3-dbb6-4a07-a595-4fe3b0d13490",
		"Status ACTIVE",
		"Relation USER_ACCOUNT_ADMIN"
	];
	return { ok: true, state: "ready", lines };
}

async function readSubscription(input) {
	if (input.tpa !== TPA_READY) {
		return { ok: true, active: false, lines: ["Enter company 611521 and finish Account TID before licensing."] };
	}
	return {
		ok: true,
		active: true,
		lines: [
			`Subscription ${DEMO_SUBSCRIPTION}`,
			"Status ACTIVE",
			"Plan Digital Transport Documents - Shipment - Growth"
		]
	};
}

async function enableSubscription() {
	return { ok: true, steps: [{ id: "lem", title: "DTD subscription", state: "ready", lines: ["Demo mode — subscription left as-is."] }] };
}

async function checkSignIn() {
	return {
		ok: true,
		steps: [{
			id: "signin",
			title: "Sign in",
			state: "ready",
			detail: "Demo mode — sign-in check skipped (paste a real Bearer to test in the app)."
		}]
	};
}

module.exports = {
	checkAccount,
	tidMessage,
	checkSetup,
	checkPerson,
	readSubscription,
	enableSubscription,
	checkSignIn,
	tpAdminUrl
};