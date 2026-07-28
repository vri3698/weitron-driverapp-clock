# How to Test the Driver Time Tracker on Your Phone

To test this app on your phone, you need to overcome two main hurdles:
1. **Compiling TSX:** Browsers cannot read `.tsx` files directly; they need to be bundled.
2. **HTTPS Requirement:** Mobile browsers **block** Camera and Geolocation APIs on standard `http://` IP addresses for security reasons. You *must* use `https://` or `localhost`.

Here are the two best ways to test it on your physical device.

---

## Method 1: The Quickest Way (Using Vite + Ngrok)

This method runs the app on your computer and creates a secure, temporary HTTPS tunnel to your phone.

### Step 1: Set up the local project
If you haven't already, set up a quick Vite project to run the React/TypeScript code:
1. Open your terminal and run: `npm create vite@latest driver-app -- --template react-ts`
2. Go into the folder: `cd driver-app`
3. Install dependencies: `npm install`
4. Replace the default Vite files in the `src` folder with the files provided previously (`App.tsx`, `index.tsx`, `types.ts`, `constants.ts`, etc.). *Note: Move `index.html` to the root folder if Vite expects it there.*
5. Start the local server: `npm run dev`

### Step 2: Create an HTTPS Tunnel
Leave your local server running. Open a **new** terminal window and use `npx` to run ngrok (a free tunneling tool):
```bash
npx ngrok http 5173
```
*(Replace `5173` with whatever port Vite is running on).*

### Step 3: Open on your Phone
1. Ngrok will output a "Forwarding" URL that looks like this: `https://a1b2-c3d4.ngrok-free.app`
2. Type that exact HTTPS URL into your phone's browser (Safari on iOS or Chrome on Android).

---

## Method 2: The Best Way (Free Cloud Deployment)

Deploying to a free service like Vercel or Netlify is the closest to a real-world test. It automatically provides a permanent HTTPS URL.

1. Push your code to a free GitHub repository.
2. Go to [Vercel.com](https://vercel.com) or [Netlify.com](https://netlify.com) and sign in with GitHub.
3. Click "Add New Project" and select your repository.
4. The default build settings for Vite/React will work automatically. Click **Deploy**.
5. Within 2 minutes, you will get a live, secure HTTPS URL (e.g., `https://driver-app.vercel.app`).
6. Open this URL on your phone.

---

## How to Test the Specific Features

Once the app is open on your phone via an HTTPS URL, test the following:

### 1. Hardware Permissions
* Tap **Clock In**.
* Your phone should prompt you: *"Driver App wants to use your current location"* and *"Driver App wants to access your camera"*.
* Tap **Allow**. If you deny them, the app's error handling UI will appear.

### 2. Offline Mode & Syncing
* **Go Offline:** Swipe down your phone's control center and turn on **Airplane Mode** (ensure Wi-Fi is also off).
* Notice the app's UI changes to an amber "Offline Mode" banner.
* Tap **Clock Out**, take a photo, and submit. It will save instantly to the local IndexedDB.
* **Go Online:** Turn Airplane Mode off.
* Watch the console or network tab (if debugging) — the app will automatically detect the connection and trigger the `syncPendingEntries` function to push the saved data to the server.

### 3. "App-Like" Experience (PWA)
You can install this web app to your home screen so it feels like a native app:
* **iOS (Safari):** Tap the "Share" icon at the bottom (square with an up arrow) -> Scroll down and tap **Add to Home Screen**.
* **Android (Chrome):** Tap the 3-dot menu at the top right -> Tap **Add to Home screen**.
* Go to your phone's home screen and open the new icon. It will open without the browser URL bar, looking like a real native app.