# Demo voiceover

## Does the sample video include audio?

No. `demo/prod-account-setup-demo.mp4` is a silent slideshow of real app screens (demo mode, no production API calls).

You can:

| Option | What to do |
| --- | --- |
| **Share as-is** | Send the MP4; teammates watch the steps with no narration. |
| **Add your voice** | Open the MP4 in **Clipchamp** (Windows), **PowerPoint**, or **DaVinci Resolve**, read the script below while you record a voice track, and export one file. |
| **Record live** | Press **Win + G**, run `npm run start:demo`, walk through the same steps, and speak while you click. That often looks more natural than dubbing the slideshow. |

There is no built-in text-to-speech in this repo. If you want an AI voice, use Clipchamp or another tool and paste the script below.

## Script (about 90 seconds)

1. **Intro** — “This is the production account setup helper for Digital Transport Documents. Download the portable exe from the GitHub release if you do not want to run from source.”

2. **Company** — “Start with the company number from TP Admin. That number is the TPA. Paste the MDM client id and secret from the Console access key, then choose Check in MDM.”

3. **Account TID** — “Step two is Account TID. If MDM has no TTC account id yet, the app helps you prepare a message for MDM or a DEVSERVICE ticket for Team Cotton. If the TID is already on the account, this step tells you to continue to People.”

4. **People** — “On People, check one person by email or Trimble Identity id. Green means they are on this company and shows the relation, for example USER_ACCOUNT_ADMIN. Amber means ask MDM to add them.”

5. **Subscription** — “On Subscription, paste LEM credentials from the DTD team. The app reads whether DTD is already licensed. When it is active, use the Yard Documents link. You can optionally paste a user Bearer to verify sign-in.”

6. **Close** — “Creating the MDM account, writing the TID, and linking users still go through MDM and Team Cotton. This tool is for verification and licensing only.”