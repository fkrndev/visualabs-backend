import { config } from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import userRoutes from "./routes/users";
import profileRoutes from "./routes/profiles";
import customerRoutes from "./routes/customers";
import customerProfileRoutes from "./routes/customerProfiles";
import settingMultipleRoutes from "./routes/settingMultiples";
import authRoutes from "./routes/auth";
import registrationRoutes from "./routes/registration";
import customerAuthRoutes from "./routes/customerAuth";
import settingsRoutes from "./routes/settings";
import openApiSpec from "./openapi/spec";
import { role } from "./utils/auth/role";
// import { readFileSync } from "fs";

config();

const app = new Hono().basePath("/api");

app.use("*", logger());
// CORS untuk public routes
const publicCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false, // Tidak perlu credentials untuk public API
});

// CORS untuk protected routes
const protectedCors = cors({
  origin: ["http://localhost:8888", "http://127.0.0.1:8888"], // Sesuaikan dengan domain yang diizinkan
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

// Terapkan CORS berdasarkan path
app.use("/api/public/*", publicCors);
// app.use("/api/checkout/*", publicCors); // Checkout adalah public endpoint
app.use("*", protectedCors);

app.get("/", (c) => {
  return c.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/test-1", async (c) => {
  const roles = await role(1);
  return c.json({
    success: true,
    data: roles,
  });
});

app.get("/openapi.json", (c) => c.json(openApiSpec));



app.route("/users", userRoutes);
app.route("/profiles", profileRoutes);
app.route("/setting-multiples", settingMultipleRoutes);
app.route("/customers", customerRoutes);
app.route("/customer-profiles", customerProfileRoutes);
app.route("/auth", authRoutes);
app.route("/public/registration", registrationRoutes);
app.route("/public", customerAuthRoutes);
app.route("/settings", settingsRoutes);

app.notFound((c) => {
  return c.json(
    {
      success: false,
      message: "Endpoint not found",
    },
    404,
  );
});

app.onError((err, c) => {
  console.error("Error:", err);
  
  // JWT errors should return 401, not 500
  if (err.name === 'JwtTokenExpired' || err.name === 'JwtTokenNotBefore' || err.message.includes('Unauthorized')) {
    return c.json(
      {
        success: false,
        message: "Unauthorized",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      },
      401,
    );
  }
  
  return c.json(
    {
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    },
    500,
  );
});

const port = parseInt(process.env.PORT || "2024", 10);
console.log("PORT:", port);
console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
