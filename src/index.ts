import { config } from "dotenv";

process.env.TZ = process.env.TZ || "Asia/Jakarta";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { securityHeaders } from "./middleware/security";
import { compression } from "./middleware/compression";

import userRoutes from "./routes/users";
import profileRoutes from "./routes/profiles";
import customerRoutes from "./routes/customers";
import customerProfileRoutes from "./routes/customerProfiles";
import settingMultipleRoutes from "./routes/settingMultiples";
import authRoutes from "./routes/auth";
import registrationRoutes from "./routes/registration";
import customerAuthRoutes from "./routes/customerAuth";
import settingsRoutes from "./routes/settings";
import productRoutes from "./routes/products";
import subscriptionRoutes from "./routes/subscriptions";
import chromeProfileRoutes from "./routes/chromeProfiles";
import profileLockRoutes from "./routes/profileLocks";
import chromeHistoryRoutes from "./routes/chromeHistories";
import ticketIssueRoutes from "./routes/ticketIssues";
import meetingRoutes from "./routes/meetings";
import scorecardRoutes from "./routes/scorecards";
import scorecardDataRoutes from "./routes/scorecardData";
import todoRoutes from "./routes/todos";
import fbActRoutes from "./routes/fbAct";
import fbTokenRoutes from "./routes/fbToken";
import marketingDashboardRoutes from "./routes/marketingDashboard";
import teamInsightsRoutes from "./routes/teamInsights";
import adsMonitoringRoutes from "./routes/adsMonitoring";
import advertiserHomeRoutes from "./routes/advertiserHome";
import notificationsRoutes from "./routes/notifications";
import onboardingRoutes from "./routes/onboarding";
import credentialRoutes from "./routes/credentials";
import clientAppRoutes from "./routes/clientApp";
import advertiserContentRoutes from "./routes/advertiserContent";
import uploadRoutes from "./routes/uploads";
import { clientVideoRoutes, adminVideoRoutes } from "./routes/videoRequest";
import { driveFolderRoutes } from "./routes/driveFolders";
import llmGatewayRoutes from "./routes/llmGateway";
import relayRoutes from "./routes/relay";
// HR modules (Fase 1–3: organisasi, karyawan, presensi, cuti)
import hrBranchRoutes from "./routes/hr/branches";
import hrDepartmentRoutes from "./routes/hr/departments";
import hrPositionRoutes from "./routes/hr/positions";
import hrEmployeeRoutes from "./routes/hr/employees";
import hrEmployeeRelationRoutes from "./routes/hr/employeeRelations";
import hrWorkScheduleRoutes from "./routes/hr/workSchedules";
import hrEmployeeScheduleRoutes from "./routes/hr/employeeSchedules";
import hrHolidayRoutes from "./routes/hr/holidays";
import hrAttendanceRoutes from "./routes/hr/attendances";
import hrLeaveRoutes from "./routes/hr/leaves";
import hrApprovalWorkflowRoutes from "./routes/hr/approvalWorkflows";
import hrPayrollRoutes from "./routes/hr/payrolls";
import hrCompensationRoutes from "./routes/hr/compensation";
import hrMeRoutes from "./routes/hr/me";
import hrAnnouncementRoutes from "./routes/hr/announcements";
import hrActivityLogRoutes from "./routes/hr/activityLogs";
import hrClientRoutes from "./routes/hr/clients";
import hrClientVisitRoutes from "./routes/hr/clientVisits";
import hrLocationTrackRoutes from "./routes/hr/locationTracks";
import hrCompanyBankRoutes from "./routes/hr/companyBankAccounts";
import hrPettyCashRoutes from "./routes/hr/pettyCash";
import hrThrRoutes from "./routes/hr/thr";
import hrSeveranceRoutes from "./routes/hr/severance";
import hrEmployeeTaxProfileRoutes from "./routes/hr/employeeTaxProfiles";
import hrTaxSlipRoutes from "./routes/hr/taxSlips";
import hrCoretaxRoutes from "./routes/hr/coretax";
import hrReportRoutes from "./routes/hr/reports";
import { websocket } from "./lib/relayWs";
import openApiSpec from "./openapi/spec";
import { role } from "./utils/auth/role";
// import { readFileSync } from "fs";

config();

const app = new Hono().basePath("/api");

app.use("*", logger());
app.use("*", securityHeaders());
app.use("*", compression());
// CORS untuk public routes
const publicCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false, // Tidak perlu credentials untuk public API
});

// CORS untuk protected routes
// origin di-reflect balik (bukan literal "*") supaya semua domain diizinkan
// sekaligus tetap valid untuk browser saat credentials: true dipakai
const protectedCors = cors({
  origin: (origin) => origin,
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
app.route("/products", productRoutes);
app.route("/subscriptions", subscriptionRoutes);
app.route("/chrome-profiles", chromeProfileRoutes);
// LLM Gateway + Relay — WAJIB di-mount SEBELUM route "/" ber-middleware-wildcard.
// hrCompensationRoutes memakai use("*", requireAuth, requirePayroll) yang, karena
// di-mount di "/", bocor ke route yang didaftarkan setelahnya. Mount di sini agar
// /api/llm/* dan /api/relay/* tidak ikut ter-gate auth/payroll.
app.route("/llm", llmGatewayRoutes);
app.route("/relay", relayRoutes);

app.route("/", profileLockRoutes);
app.route("/chrome-histories", chromeHistoryRoutes);
app.route("/ticket-issues", ticketIssueRoutes);
app.route("/meetings", meetingRoutes);
app.route("/scorecards", scorecardRoutes);
app.route("/scorecard-data", scorecardDataRoutes);
app.route("/todos", todoRoutes);
app.route("/fb-act", fbActRoutes);
app.route("/fb-token", fbTokenRoutes);
app.route("/marketing-dashboard", marketingDashboardRoutes);
app.route("/team-insights", teamInsightsRoutes);
app.route("/ads-monitoring", adsMonitoringRoutes);
app.route("/advertiser-home", advertiserHomeRoutes);
app.route("/notifications", notificationsRoutes);
app.route("/onboarding", onboardingRoutes);
app.route("/credentials", credentialRoutes);
app.route("/client", clientAppRoutes);
app.route("/client", clientVideoRoutes);
app.route("/advertiser", advertiserContentRoutes);
app.route("/uploads", uploadRoutes);
app.route("/drive-folders", driveFolderRoutes);
app.route("/video-requests", adminVideoRoutes);

// HR modules (Fase 1–3) — organisasi, karyawan, presensi, cuti
app.route("/branches", hrBranchRoutes);
app.route("/departments", hrDepartmentRoutes);
app.route("/positions", hrPositionRoutes);
app.route("/employees", hrEmployeeRoutes);
app.route("/employees", hrEmployeeRelationRoutes);
app.route("/work-schedules", hrWorkScheduleRoutes);
app.route("/employee-schedules", hrEmployeeScheduleRoutes);
app.route("/holidays", hrHolidayRoutes);
app.route("/attendances", hrAttendanceRoutes);
app.route("/leaves", hrLeaveRoutes);
app.route("/approval-workflows", hrApprovalWorkflowRoutes);
app.route("/payrolls", hrPayrollRoutes);

// Relay Hub — jembatan browser ⇄ node Hermes (node tetap client, dial keluar)
// Harus didaftarkan SEBELUM route yang punya JWT middleware global (compensation di "/")
app.route("/relay", relayRoutes);

// compensation di-mount root: /salary-structures, /allowances, /employee-allowances
app.route("/", hrCompensationRoutes);
// Portal ESS (self-service karyawan)
app.route("/me", hrMeRoutes);
// Fase 7 — pendukung: pengumuman + audit log
app.route("/announcements", hrAnnouncementRoutes);
app.route("/activity-logs", hrActivityLogRoutes);
// Fase 9 — field/sales
app.route("/clients", hrClientRoutes);
app.route("/client-visits", hrClientVisitRoutes);
app.route("/location-tracks", hrLocationTrackRoutes);
// Fase 8 — keuangan (rekening perusahaan + petty cash)
app.route("/company-bank-accounts", hrCompanyBankRoutes);
app.route("/petty-cash", hrPettyCashRoutes);
// Fase 8 lanjut — THR, pesangon, pajak, coretax, laporan
app.route("/thr", hrThrRoutes);
app.route("/severance", hrSeveranceRoutes);
app.route("/employee-tax-profiles", hrEmployeeTaxProfileRoutes);
app.route("/tax-slips", hrTaxSlipRoutes);
app.route("/coretax", hrCoretaxRoutes);
app.route("/reports", hrReportRoutes);

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
  if (err.name === 'JwtTokenExpired' || err.name === 'JwtTokenNotBefore' || err.message.includes('Unauthorized') || err.message.includes('no authorization included in request')) {
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

export { app };

export default {
  port,
  fetch: app.fetch,
  websocket,
};
