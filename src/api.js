const https = require("https");

const IDENTITY = "https://id.trimble.com/oauth/token";
const ACCOUNTS = "https://eu1.api.trimble.com/transportation/core/mdm/accounts-api";
const IDENTITIES = "https://eu1.api.trimble.com/transportation/core/mdm/identities-api";
const RELATIONS = "https://eu1.api.trimble.com/transportation/core/mdm/relations-api";
const SEARCH = "https://eu1.api.trimble.com/transportation/core/mdm/search-api";
const TTC_ACCOUNTS = "https://eu1.api.trimble.com/transportation/api/core/v2/accounts";
const SLM = "https://eu1.api.trimble.com/transportation/subscription-management/v1";
const DOCUMENTS = "https://documents-api.eu.trimble-transportation.com";

const PLAN_ID = "a56b3963-ca93-4a0a-9c58-46dfbe70a231";
const FEATURE_IDS = [
	"563ce657-3b92-440e-913a-94c81298b430",
	"16a931df-445f-4c57-96e2-582efa088c1a",
	"4ec53859-9d79-44e7-bdb2-dbe370700f44",
	"4cab815a-f4f1-41a0-aa3a-59bdb41bfa00"
];
const MEMBER_TYPES = new Set(["USER_ACCOUNT_ADMIN", "USER_ACCOUNT_OWNER", "USER_ORGANIZATION_ADMIN"]);

function request(method, url, headers, body) {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const payload = body == null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
		const req = https.request({
			method,
			protocol: target.protocol,
			hostname: target.hostname,
			path: `${target.pathname}${target.search}`,
			headers: {
				Accept: "application/json",
				...headers,
				...(payload ? {
					"Content-Type": headers["Content-Type"] || "application/json",
					"Content-Length": payload.length
				} : {})
			}
		}, (res) => {
			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				let json = null;
				try {
					json = text ? JSON.parse(text) : null;
				} catch (error) {
					json = null;
				}
				resolve({ status: res.statusCode, json, text });
			});
		});
		req.setTimeout(30000, () => req.destroy(new Error("The call timed out after 30 seconds.")));
		req.on("error", reject);
		if (payload) {
			req.write(payload);
		}
		req.end();
	});
}

function failureText(response) {
	const body = response.json || {};
	const detail = body.detail || body.message || body.error_description || body.error || "";
	const title = body.title || body.errorCode || "";
	const extra = [title, detail].filter(Boolean).join(": ");
	return extra ? `HTTP ${response.status}. ${extra}` : `HTTP ${response.status}.`;
}

async function accessToken(basic, scope) {
	const response = await request("POST", IDENTITY, {
		Authorization: basic,
		"Content-Type": "application/x-www-form-urlencoded"
	}, `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`);
	if (response.status !== 200 || !response.json || !response.json.access_token) {
		throw new Error(failureText(response));
	}
	return response.json.access_token;
}

function bearer(token) {
	return { Authorization: `Bearer ${token}` };
}

function coreOf(json) {
	if (!json) {
		return {};
	}
	return json.core || json;
}

function refValue(refs, source) {
	const match = (refs || []).find((ref) => String(ref.source || "").toUpperCase() === source);
	return match ? String(match.id || "") : "";
}

function pageItems(json) {
	if (!json) {
		return [];
	}
	if (Array.isArray(json)) {
		return json;
	}
	return json.items || json.content || json.licenses || json.subscriptions || [];
}

function tpAdminUrl(tpa) {
	return `https://tpadmin.transporeon.nil/company/${tpa}`;
}

function basicFromPair(clientId, clientSecret) {
	return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function slmBasic(value) {
	const trimmed = value.trim();
	return trimmed.toLowerCase().startsWith("basic ") ? trimmed : `Basic ${trimmed}`;
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
		"Use this UUID, which is the TTC account id, and leave the UUID at the end of the TRN unchanged."
	].join("\n");
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

function userMessage(input, accountTrn, ttcAccountUuid, users) {
	const lines = users.map((user) => `- ${user.name} — ${user.email} — TID ${user.userTid} — Transporeon user id ${user.userTpa}`);
	return [
		`Please add these people to production MDM account ${accountTrn} (TPA ${input.tpa}) as USER_ACCOUNT_ADMIN.`,
		"",
		...lines,
		"",
		"If two MDM users share this email, attach the TID to the one that belongs to this company.",
		"",
		`On the account, TID is TTC account ${ttcAccountUuid || "{ttcAccountUuid}"} and TPA stays ${input.tpa}.`
	].join("\n");
}

function step(id, title, state, detail, message) {
	return { id, title, state, detail, message: message || "" };
}

async function readAccount(input) {
	if (!input.mdmClientId || !input.mdmClientSecret) {
		throw new Error("Enter the MDM client id and client secret.");
	}
	if (!input.tpa) {
		throw new Error("Enter the company number from TP Admin.");
	}
	const token = await accessToken(basicFromPair(input.mdmClientId, input.mdmClientSecret), "TTC-CTP-MDM");
	const lookup = await request("GET", `${ACCOUNTS}/v1/accounts/lookup?type=TPA&value=${encodeURIComponent(input.tpa)}`, bearer(token));
	if (lookup.status === 404) {
		return { token, missing: true };
	}
	if (lookup.status !== 200) {
		throw new Error(`MDM account lookup failed. ${failureText(lookup)}`);
	}
	const accountTrn = coreOf(lookup.json).id;
	if (!accountTrn) {
		throw new Error("MDM lookup returned no account TRN.");
	}
	const accountResponse = await request("GET", `${ACCOUNTS}/v1/accounts/${encodeURIComponent(accountTrn)}`, bearer(token));
	if (accountResponse.status !== 200) {
		throw new Error(`MDM account read failed. ${failureText(accountResponse)}`);
	}
	const account = coreOf(accountResponse.json);
	return {
		token,
		missing: false,
		accountTrn,
		status: String(account.status || ""),
		accountName: account.accountName || "",
		tpaRef: refValue(account.externalReferences, "TPA"),
		tid: refValue(account.externalReferences, "TID")
	};
}

async function readTtc(uuid, consoleToken, tpa) {
	if (!uuid) {
		return { state: "waiting", detail: "No TTC account UUID yet. Raise a DEVSERVICE ticket to Team Cotton, then ask MDM to store that UUID as the account TID.", message: "" };
	}
	if (!consoleToken) {
		return { state: "waiting", detail: `TTC account UUID is ${uuid}. Paste a Console Bearer to verify tp_company_id.`, message: "" };
	}
	const account = await request("GET", `${TTC_ACCOUNTS}/${encodeURIComponent(uuid)}`, bearer(consoleToken));
	if (account.status === 404) {
		return { state: "blocked", detail: `Console could not find TTC account ${uuid}.`, message: "" };
	}
	if (account.status !== 200) {
		return { state: "blocked", detail: `TTC account read failed. ${failureText(account)}`, message: "" };
	}
	const references = await request("GET", `${TTC_ACCOUNTS}/${encodeURIComponent(uuid)}/references`, bearer(consoleToken));
	if (references.status !== 200) {
		return { state: "blocked", detail: `TTC references read failed. ${failureText(references)}`, message: "" };
	}
	const found = findTpCompanyId(references.json);
	if (found === tpa) {
		return { state: "ready", detail: `TTC account ${uuid} exists and tp_company_id is ${tpa}. People do not need to be members of this account.`, message: "" };
	}
	return { state: "blocked", detail: `TTC account ${uuid} exists, and tp_company_id is ${found || "missing"}. It should equal ${tpa}.`, message: "" };
}

function findTpCompanyId(json) {
	const hits = [];
	walk(json, hits);
	return hits[0] || "";
}

function walk(value, hits) {
	if (!value || typeof value !== "object") {
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item) => walk(item, hits));
		return;
	}
	const name = String(value.name || value.key || value.type || value.source || "").toLowerCase();
	if (name === "tp_company_id" && value.value != null) {
		hits.push(String(value.value));
	}
	if (value.tp_company_id != null) {
		hits.push(String(value.tp_company_id));
	}
	Object.values(value).forEach((child) => walk(child, hits));
}

async function readUser(token, user, accountTrn) {
	const response = await request("GET", `${IDENTITIES}/v1/users/${encodeURIComponent(user.userTid)}?identifierSourceType=TID`, bearer(token));
	if (response.status !== 200) {
		return { user, ok: false, detail: `User lookup failed. ${failureText(response)}` };
	}
	const core = coreOf(response.json);
	const userTrn = core.id || "";
	if (!userTrn) {
		return { user, ok: false, detail: `${user.name}: MDM user response had no user TRN.` };
	}
	const status = String(core.status || "");
	const email = String(core.email || "");
	const userTpa = refValue(core.externalReferences, "TPA");
	const problems = [];
	if (status.toUpperCase() !== "ACTIVE") {
		problems.push(`status is ${status || "missing"}`);
	}
	if (email && user.email && email.toLowerCase() !== user.email.toLowerCase()) {
		problems.push(`email on the MDM user is ${email}`);
	}
	if (user.userTpa && userTpa && userTpa !== user.userTpa) {
		problems.push(`Transporeon user id on the MDM user is ${userTpa}`);
	}
	const relations = await request("POST", `${RELATIONS}/v1/relations/query?pageSize=100&status=ACTIVE`, {
		...bearer(token),
		"Content-Type": "application/json"
	}, { query: [{ field: "sourceId", operator: "eq", value: userTrn }] });
	if (relations.status !== 200) {
		problems.push(`relation query failed. ${failureText(relations)}`);
	}
	const linked = pageItems(relations.json).map(coreOf).some((relation) =>
		relation.destinationId === accountTrn
		&& MEMBER_TYPES.has(relation.relationTypeName)
		&& String(relation.status || "ACTIVE").toUpperCase() === "ACTIVE");
	if (relations.status === 200 && !linked) {
		problems.push("no active admin link to this company");
	}
	if (problems.length > 0) {
		return { user, ok: false, userTrn, detail: `${user.name}: ${problems.join("; ")}.` };
	}
	return { user, ok: true, userTrn, detail: `${user.name} is ACTIVE and linked as an admin.` };
}

function filledUsers(users) {
	return (users || []).filter((user) => user.name || user.email || user.userTid || user.userTpa);
}

function validateUsers(users) {
	const missing = users.find((user) => !user.name || !user.email || !user.userTid || !user.userTpa);
	if (missing) {
		throw new Error("Each person needs a name, email, Trimble Identity id, and Transporeon user id.");
	}
}

async function checkAccount(input) {
	try {
		const account = await readAccount(input);
		if (account.missing) {
			return {
				ok: true,
				found: false,
				hasTid: false,
				detail: "MDM has no account for this company number.",
				message: createAccountMessage(input)
			};
		}
		const lines = [
			account.accountName ? `Account name ${account.accountName}` : "",
			account.accountTrn ? `Account TRN ${account.accountTrn}` : "",
			`Status ${account.status || "missing"}`,
			`TPA ${account.tpaRef || "missing"}`,
			`TID ${account.tid || "missing"}`
		].filter(Boolean);
		return {
			ok: true,
			found: true,
			hasTid: Boolean(account.tid),
			accountTrn: account.accountTrn,
			accountName: account.accountName || "",
			status: account.status,
			tpaRef: account.tpaRef,
			tid: account.tid || "",
			detail: lines.join(". "),
			lines,
			cotton: cottonMessage(input)
		};
	} catch (error) {
		return { ok: false, error: error.message };
	}
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

async function checkSetup(input) {
	try {
		const account = await readAccount(input);
		const steps = [];
		if (account.missing) {
			steps.push(step("ttc", "TTC account", "waiting", "MDM has no account for this company number yet, so the TTC UUID cannot be read from it.", cottonMessage(input)));
			steps.push(step("mdm", "MDM account and users", "waiting", "Ask MDM to create the account. This app cannot create it.", createAccountMessage(input)));
			return { ok: true, steps, accountTrn: "" };
		}
		const ttcUuid = (input.ttcAccountUuid || account.tid || "").trim();
		const ttc = await readTtc(ttcUuid, input.consoleToken, input.tpa);
		if (!account.tid) {
			steps.push(step("ttc", "TTC account", ttc.state === "ready" ? "waiting" : ttc.state, ttc.state === "ready"
				? `TTC account ${ttcUuid} checks out. MDM still needs that UUID written as TID.`
				: ttc.detail, ttcUuid ? tidPatchMessage(input, account.accountTrn, ttcUuid, account.accountName) : cottonMessage(input)));
		} else {
			steps.push(step("ttc", "TTC account", ttc.state, ttc.detail, ttc.message));
		}
		const accountReady = account.status.toUpperCase() === "ACTIVE" && account.tpaRef === input.tpa && account.tid;
		const accountDetail = [
			account.accountName,
			account.accountTrn,
			`status ${account.status || "missing"}`,
			`TPA ${account.tpaRef || "missing"}`,
			`TID ${account.tid || "missing"}`
		].filter(Boolean).join(". ");
		const users = filledUsers(input.users);
		if (users.length === 0) {
			steps.push(step("mdm", "MDM account and users", accountReady ? "waiting" : "blocked", `${accountDetail} Add the people who need to sign in.`, ""));
			return { ok: true, steps, accountTrn: account.accountTrn, tid: account.tid };
		}
		validateUsers(users);
		const checked = [];
		for (const user of users) {
			checked.push(await readUser(account.token, user, account.accountTrn));
		}
		const failed = checked.filter((item) => !item.ok);
		const userDetail = checked.map((item) => item.detail).join(" ");
		steps.push(step(
			"mdm",
			"MDM account and users",
			accountReady && failed.length === 0 ? "ready" : "blocked",
			`${accountDetail} ${userDetail}`,
			failed.length > 0 ? userMessage(input, account.accountTrn, account.tid, failed.map((item) => item.user)) : ""
		));
		return { ok: true, steps, accountTrn: account.accountTrn, tid: account.tid };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}

function subscriptionBody(accountTrn) {
	return {
		planId: PLAN_ID,
		accounts: {
			provisionAccountId: accountTrn,
			mdmProvisionalAccountId: accountTrn,
			billingAccountId: accountTrn
		},
		licenseModel: { type: "USAGE_BASED", entity: "ACCOUNT", allocation: "LIMITED" },
		allocation: {
			usageQuotas: FEATURE_IDS.map((featureId) => ({
				featureId,
				usageObject: { usageObjectType: "INT", usageObjectValue: 500 }
			}))
		},
		commitment: { termMonths: 12, autoRenew: false },
		metadata: { sourceSystem: "ADMIN_PORTAL", sourceAccount: "MDM" }
	};
}

async function listSubscriptions(input) {
	if (!input.lemCredentials) {
		throw new Error("Paste LEM_SLM_CREDENTIALS from the DTD team.");
	}
	const account = await readAccount(input);
	if (account.missing) {
		return { account, subscriptions: null, missing: true };
	}
	const token = await accessToken(slmBasic(input.lemCredentials), "SSM_DTT_Prod");
	const list = await request("GET", `${SLM}/slm/subscriptions?mdmProvisionalAccountId=${encodeURIComponent(account.accountTrn)}&page=0&size=20`, bearer(token));
	if (list.status !== 200) {
		throw new Error(`Subscription list failed. ${failureText(list)}`);
	}
	return { account, token, subscriptions: pageItems(list.json), missing: false };
}

function subscriptionLines(item, trailing) {
	const lines = [
		`Subscription ${item.id}`,
		`Status ${item.status || "missing"}`,
		item.planId === PLAN_ID ? "Plan Digital Transport Documents - Shipment - Growth" : `Plan ${item.planId || "unknown"}`
	];
	if (trailing) {
		lines.push(trailing);
	}
	return lines;
}

async function readSubscription(input) {
	try {
		const listed = await listSubscriptions(input);
		if (listed.missing) {
			return { ok: true, active: false, lines: ["MDM has no account for this company yet."] };
		}
		const active = listed.subscriptions.find((item) => String(item.status || "").toUpperCase() === "ACTIVE");
		if (active) {
			return { ok: true, active: true, lines: subscriptionLines(active, "Already licensed. Leave this subscription.") };
		}
		if (listed.subscriptions.length === 0) {
			return { ok: true, active: false, lines: ["No subscription on this account yet."] };
		}
		const existing = listed.subscriptions[0];
		return { ok: true, active: false, lines: subscriptionLines(existing, "This subscription is not active yet.") };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}

async function enableSubscription(input) {
	try {
		if (!input.lemCredentials) {
			throw new Error("Paste LEM_SLM_CREDENTIALS from the DTD team.");
		}
		const listed = await listSubscriptions(input);
		const account = listed.account;
		if (listed.missing) {
			return { ok: true, steps: [step("lem", "DTD subscription", "blocked", "MDM has no account for this company yet. License the account after MDM creates it.", "")] };
		}
		if (String(account.status).toUpperCase() !== "ACTIVE") {
			return { ok: true, steps: [step("lem", "DTD subscription", "blocked", `The MDM account status is ${account.status || "missing"}. Leave the subscription until it is ACTIVE.`, "")] };
		}
		const token = listed.token;
		const subscriptions = listed.subscriptions;
		const active = subscriptions.find((item) => String(item.status || "").toUpperCase() === "ACTIVE");
		if (active) {
			return { ok: true, active: true, steps: [{ id: "lem", title: "DTD subscription", state: "ready", lines: subscriptionLines(active, "Already licensed. Leave this subscription.") }] };
		}
		const existing = subscriptions.find((item) => item.planId === PLAN_ID) || subscriptions[0];
		let subscriptionId = existing && existing.id;
		if (!subscriptionId) {
			const created = await request("POST", `${SLM}/slm/subscriptions`, bearer(token), subscriptionBody(account.accountTrn));
			if (created.status !== 200 && created.status !== 201) {
				throw new Error(`Subscription create failed. ${failureText(created)}`);
			}
			subscriptionId = (created.json || {}).id;
			if (!subscriptionId) {
				throw new Error("Subscription create returned no id.");
			}
		}
		if (!existing || String(existing.status || "").toUpperCase() !== "ACTIVE") {
			const activated = await request("POST", `${SLM}/slm/subscriptions/${encodeURIComponent(subscriptionId)}/activate`, bearer(token), {
				activationNotes: "DTD Core production activation"
			});
			if (activated.status !== 200 && activated.status !== 201 && activated.status !== 204) {
				throw new Error(`Subscription activate failed. ${failureText(activated)}`);
			}
		}
		const after = await request("GET", `${SLM}/slm/subscriptions/${encodeURIComponent(subscriptionId)}`, bearer(token));
		const status = coreOf(after.json).status || (after.json || {}).status || "ACTIVE";
		const tidNote = account.tid ? "" : " The account TID is still empty, so sign-in can stay not ready until MDM writes it.";
		return { ok: true, steps: [step("lem", "DTD subscription", "ready", `Subscription ${subscriptionId} is ${status} on ${account.accountTrn}.${tidNote}`, "")] };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}

function personMessage(input, accountTrn, person) {
	return [
		`Please add this person to production MDM account ${accountTrn} (TPA ${input.tpa}) as USER_ACCOUNT_ADMIN.`,
		"",
		person,
		"",
		"If two MDM users share this email, attach the TID to the one that belongs to this company."
	].join("\n");
}

function personLines(user, relationTypes) {
	const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
	const lines = [`Name ${name}`];
	if (user.email) {
		lines.push(`Email ${user.email}`);
	}
	lines.push(`User id ${user.id}`);
	const tid = refValue(user.externalReferences, "TID");
	if (tid) {
		lines.push(`TID ${tid}`);
	}
	lines.push(`Status ${user.status || "missing"}`);
	if (relationTypes) {
		lines.push(`Relation ${relationTypes.join(", ") || "missing"}`);
	}
	return lines;
}

async function relationsForUser(token, userTrn) {
	const relations = await request("POST", `${RELATIONS}/v1/relations/query?pageSize=100&status=ACTIVE`, {
		...bearer(token),
		"Content-Type": "application/json"
	}, { query: [{ field: "sourceId", operator: "eq", value: userTrn }] });
	if (relations.status !== 200) {
		throw new Error(`Relation query failed. ${failureText(relations)}`);
	}
	return pageItems(relations.json).map(coreOf);
}

async function checkPerson(input) {
	try {
		const person = (input.person || "").trim();
		if (!person) {
			throw new Error("Enter an email or a Trimble Identity id.");
		}
		const account = await readAccount(input);
		if (account.missing) {
			return { ok: true, state: "blocked", lines: ["MDM has no account for this company yet."] };
		}
		let users = [];
		if (person.includes("@")) {
			const search = await request("POST", `${SEARCH}/v1/search/users?pageSize=10`, {
				...bearer(account.token),
				"Content-Type": "application/json"
			}, { query: { and: [{ field: "core.email", operator: "ieq", value: person }] } });
			if (search.status !== 200) {
				throw new Error(`User search failed. ${failureText(search)}`);
			}
			const wanted = person.toLowerCase();
			users = pageItems(search.json).map(coreOf).filter((user) => user.id && String(user.email || "").toLowerCase() === wanted);
		} else {
			const response = await request("GET", `${IDENTITIES}/v1/users/${encodeURIComponent(person)}?identifierSourceType=TID`, bearer(account.token));
			if (response.status === 404) {
				return {
					ok: true,
					state: "waiting",
					lines: ["This user is not in MDM."],
					message: personMessage(input, account.accountTrn, person)
				};
			}
			if (response.status !== 200) {
				throw new Error(`User lookup failed. ${failureText(response)}`);
			}
			users = [coreOf(response.json)].filter((user) => user.id);
		}
		const distinct = [];
		const seen = new Set();
		users.forEach((user) => {
			if (!seen.has(user.id)) {
				seen.add(user.id);
				distinct.push(user);
			}
		});
		if (distinct.length === 0) {
			return {
				ok: true,
				state: "waiting",
				lines: ["This user is not in MDM."],
				message: personMessage(input, account.accountTrn, person)
			};
		}
		const checked = [];
		for (const user of distinct) {
			const onAccount = (await relationsForUser(account.token, user.id)).filter((relation) =>
				relation.destinationId === account.accountTrn
				&& String(relation.status || "ACTIVE").toUpperCase() === "ACTIVE");
			const types = [...new Set(onAccount.map((relation) => relation.relationTypeName).filter(Boolean))];
			checked.push({ user, types });
		}
		const linked = checked.filter((item) => item.types.length > 0);
		const unlinked = checked.filter((item) => item.types.length === 0);
		const steps = [];
		linked.forEach((item, index) => {
			const lines = personLines(item.user, item.types);
			lines.unshift("On this company.");
			if (index === 0 && distinct.length > 1) {
				lines.unshift(`MDM has ${distinct.length} users with this email.`);
			}
			steps.push({ state: "ready", lines });
		});
		unlinked.forEach((item, index) => {
			steps.push({
				state: "waiting",
				lines: ["Not on this company.", ...personLines(item.user)],
				message: linked.length === 0 && index === 0 ? personMessage(input, account.accountTrn, person) : ""
			});
		});
		return { ok: true, state: linked.length > 0 ? "ready" : "waiting", steps };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}

async function checkSignIn(input) {
	try {
		if (!input.userAccessToken) {
			throw new Error("Paste the user's Digital Transport Documents session Bearer.");
		}
		const account = await readAccount(input);
		if (account.missing) {
			return { ok: true, steps: [step("signin", "Sign in", "blocked", "MDM has no account for this company yet.", "")] };
		}
		const response = await request("GET", `${DOCUMENTS}/yard-management/v1/documents/me?company=${encodeURIComponent(account.accountTrn)}`, bearer(input.userAccessToken));
		if (response.status === 403) {
			return { ok: true, steps: [step("signin", "Sign in", "blocked", "Sign-in was refused. Check the user link with MDM.", failureText(response))] };
		}
		if (response.status !== 200) {
			throw new Error(`Sign-in check failed. ${failureText(response)}`);
		}
		const body = response.json || {};
		const productActivated = body.productActivated === true;
		const tenantContextReady = body.tenantContextReady === true;
		const activeId = body.activeAccount && body.activeAccount.id;
		const ready = productActivated && tenantContextReady && activeId === account.accountTrn;
		const detail = `productActivated ${productActivated}, tenantContextReady ${tenantContextReady}, active account ${activeId || "missing"}.`;
		return { ok: true, steps: [step("signin", "Sign in", ready ? "ready" : "blocked", detail, "")] };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}

module.exports = { checkAccount, tidMessage, checkSetup, checkPerson, readSubscription, enableSubscription, checkSignIn, tpAdminUrl };
