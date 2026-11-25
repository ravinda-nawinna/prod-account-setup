# Prod account setup

Desktop app for the production account setup guide. This folder is the whole app. It is separate from the documents repo. It runs on Windows, macOS, and Ubuntu from the same source.

The app reads MDM and TTC, checks that each person is linked to the company, and can create the Digital Transport Documents subscription when one does not exist. Creating the MDM account, writing the account TID, and linking users stay with MDM and Team Cotton. When one of those is missing, the result includes a message to copy.

## Run

```powershell
npm install
npm start
```

Credentials are saved in the Electron user data folder on this computer.

## Download

The latest Windows portable executable, macOS app archive, and Linux AppImage are on the [latest release](https://github.com/ravinda-nawinna/prod-account-setup/releases/tag/latest). These builds are not code-signed.

## What you fill in

- Company number (TPA) from TP Admin. The app checks MDM and continues to People when the account TID is already set.
- TTC account id, only when the MDM account has no TID
- One person at a time: email or Trimble Identity id
- MDM client id and client secret from the Console access key
- `LEM_SLM_CREDENTIALS` from the DTD team
- Optional Console Bearer, to verify the TTC account
- Optional DTD session Bearer, to check sign-in
