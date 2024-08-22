# Solar Ad Tester

This repository contains the codebase for the Solar Ad Tester project, which includes Firebase functions, Firestore rules, and a frontend for managing ad campaigns.

## Setup Instructions

1. **Clone the repository:**

    ```sh
    git clone https://github.com/yourusername/solar-ad-tester.git
    cd solar-ad-tester
    ```

2. **Install dependencies for Firebase functions:**

    ```sh
    cd functions
    npm install
    ```

3. **Set up Firebase project:**

    - Ensure you have the Firebase CLI installed.
    - Log in to Firebase:
        ```sh
        firebase login
        ```
    - Initialize Firebase in your project directory:
        ```sh
        firebase init
        ```

4. **Deploy locally:**

    - To serve your project locally, run:
        ```sh
        npm run serve
        ```

5. **Deploy to the cloud:**
    - To deploy Firebase functions and hosting to the cloud, run:
        ```sh
        firebase deploy
        ```

## Firebase Hosting and Functions

### Hosting

Firebase Hosting is used to serve the frontend of the Solar Ad Tester project. The frontend code is located in the `public` directory and includes HTML, CSS, and JavaScript files.

### Functions

Firebase Functions are used to handle backend logic, such as creating ads and interacting with Firestore. The functions are written in TypeScript and located in the `functions` directory.

## User Scripts

The repository includes user scripts for interacting with Facebook's Ad Library. These scripts are located in the `userscripts` directory.

### Fb Library Ad Downloader

This script allows you to download Facebook Library Ads with a single click.
