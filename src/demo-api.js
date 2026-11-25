const DEMO_TPA = "611521";
const DEMO_TRN = "trn:ttc:ctp-mdm:eu:prod:accounts:a9737fa3-ed28-4725-9536-0dea3d9eb02d";
const DEMO_TID = "54cefbf7-f69e-4016-82e7-5bf29cad4087";
const DEMO_SUBSCRIPTION = "9f1ad74f-a212-44d7-a6b6-ce69c354ee3e";
const DEMO_CLIENT_ID = "d86faa30-2a20-4850-b041-bc167bb5abd9";

const accountLines = () => [
	`Account name Central Demo Environment`,
	`Account TRN ${DEMO_TRN}`,
	"Status ACTIVE",
	`TPA ${DEMO_TPA}`,
	`TID ${DEMO_TID}`
];

function accountResult() {
	const lines = accountLines();
	return {
		ok: true,
		found: true,
		hasTid: true,
		accountTrn: DEMO_TRN,
		accountName: "Central Demo Environment",
		status: "ACTIVE",
		tpaRef: DEMO_TPA,
		tid: DEMO_TID,
		detail: lines.join(". "),
		lines,
		cotton: "Demo mode — no Cotton message."
	};
}

async function checkAccount(input) {
	if (!input.tpa) {
		return { ok: false, error: "Enter the company number from TP Admin." };
	}
	if (input.tpa !== DEMO_TPA) {
		return {
			ok: true,
			found: false,
			hasTid: false,
			detail: "MDM has no account for this company number (demo only knows 611521).",
			message: "Demo mode — ask MDM to create the account."
		};
	}
	return accountResult();
}

function tidMessage(input) {
	return { ok: true, message: "Demo mode — message for MDM would appear here." };
}

async function checkSetup() {
	return { ok: true, steps: [] };
}

async function checkPerson(input) {
	const person = (input.person || "").trim();
	if (!person) {
		return { ok: false, error: "Enter an email or a Trimble Identity id." };
	}
	const lines = [
		"On this company.",
		"Name Benjamin Vanzetta",
		"Email benjamin_vanzetta@trimble.com",
		"User id trn:ttc:ctp-mdm:eu:prod:users:1b9919ad-3efc-493e-889e-9c245074833d",
		`TID ed001ae3-dbb6-4a07-a595-4fe3b0d13490`,
		"Status ACTIVE",
		"Relation USER_ACCOUNT_ADMIN"
	];
	return { ok: true, state: "ready", lines };
}

async function readSubscription() {
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
	tpAdminUrl: (tpa) => `https://tpadmin.transporeon.nil/company/${tpa}`,
	DEMO_CLIENT_ID
};