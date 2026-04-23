import {randomBytes, createHash} from "crypto";

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI_CUSTOMER = process.env.GOOGLE_REDIRECT_URI_CUSTOMER || "http://localhost:3006/api/public/auth/google/callback";
const GOOGLE_REDIRECT_URI_ADMIN = process.env.GOOGLE_REDIRECT_URI_ADMIN || "http://localhost:3006/api/auth/google/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:2026";

export interface GoogleOAuthConfig {
    userType: "customer" | "admin";
    code?: string;
    state?: string;
    error?: string;
    cookieHeader: string;
    codeVerifier?: string;
    codeChallenge?: string;
}

export interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture: string;
}

export interface GoogleOAuthResult {
    success: boolean;
    user?: GoogleUserInfo;
    errorRedirect?: string;
}

/**
 * Generate Google OAuth URL with PKCE and state cookie for redirect
 */
export function getGoogleAuthUrl(userType: "customer" | "admin"): {
    url: string;
    stateCookie: string;
    codeVerifier: string;
} {
    const state = randomBytes(16).toString("hex");

    // PKCE: Generate code verifier and challenge
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const redirectUri = userType === "customer" ? GOOGLE_REDIRECT_URI_CUSTOMER : GOOGLE_REDIRECT_URI_ADMIN;

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const stateCookie = `oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`;
    const codeVerifierCookie = `oauth_code_verifier=${codeVerifier}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`;

    // Combine both cookies
    const combinedCookie = `${stateCookie}; ${codeVerifierCookie}`;

    return {url: googleAuthUrl, stateCookie: combinedCookie, codeVerifier};
}

/**
 * Handle Google OAuth callback - shared logic for both customer and admin
 */
export async function handleGoogleOAuthCallback(config: GoogleOAuthConfig): Promise<GoogleOAuthResult> {
    const {userType, code, state, error, cookieHeader} = config;

    // Check if there's an error from Google
    if (error) {
        const redirectPath = userType === "customer" ? "/login" : "/admin/login";
        return {
            success: false,
            errorRedirect: `${FRONTEND_URL}${redirectPath}?error=${encodeURIComponent(error)}`,
        };
    }

    if (!code || !state) {
        const redirectPath = userType === "customer" ? "/login" : "/admin/login";
        return {
            success: false,
            errorRedirect: `${FRONTEND_URL}${redirectPath}?error=missing_code_or_state`,
        };
    }

    // Validate state (from cookie)
    const cookies = Object.fromEntries(
        cookieHeader.split("; ").map((c) => {
            const [key, ...v] = c.split("=");
            return [key, v.join("=")];
        }),
    );

    const savedState = cookies["oauth_state"];
    if (savedState !== state) {
        const redirectPath = userType === "customer" ? "/login" : "/admin/login";
        return {
            success: false,
            errorRedirect: `${FRONTEND_URL}${redirectPath}?error=invalid_state`,
        };
    }

    // PKCE: Get code verifier from cookie
    const codeVerifier = cookies["oauth_code_verifier"];
    if (!codeVerifier) {
        const redirectPath = userType === "customer" ? "/login" : "/admin/login";
        return {
            success: false,
            errorRedirect: `${FRONTEND_URL}${redirectPath}?error=missing_code_verifier`,
        };
    }

    try {
        // Exchange code for access token
        const redirectUri = userType === "customer" ? GOOGLE_REDIRECT_URI_CUSTOMER : GOOGLE_REDIRECT_URI_ADMIN;

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error("Token exchange failed:", errorData);
            const redirectPath = userType === "customer" ? "/login" : "/admin/login";
            return {
                success: false,
                errorRedirect: `${FRONTEND_URL}${redirectPath}?error=token_exchange_failed`,
            };
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Get user info from Google
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!userInfoResponse.ok) {
            const redirectPath = userType === "customer" ? "/login" : "/admin/login";
            return {
                success: false,
                errorRedirect: `${FRONTEND_URL}${redirectPath}?error=failed_to_get_user_info`,
            };
        }

        const googleUser = await userInfoResponse.json();
        const {id: googleId, email, name, picture} = googleUser;

        return {
            success: true,
            user: {id: googleId, email, name, picture},
        };
    } catch (error: any) {
        console.error("Google OAuth error:", error);
        const redirectPath = userType === "customer" ? "/login" : "/admin/login";
        return {
            success: false,
            errorRedirect: `${FRONTEND_URL}${redirectPath}?error=oauth_failed`,
        };
    }
}
