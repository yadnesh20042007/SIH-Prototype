import { describe, expect, it } from "vitest";

import {
  validateTestSessionCreate,
  validateTestSessionUpdate,
} from "./test-session";

const validCreate = {
  instrumentId: "instrument-1",
  verificationContext: "INITIAL_VERIFICATION",
  rulesetVersionId: "ruleset-1",
  technicianId: "technician-1",
} as const;

describe("TestSession validation", () => {
  describe("create", () => {
    it("accepts a valid minimal create payload", () => {
      expect(validateTestSessionCreate(validCreate)).toEqual({
        success: true,
        data: validCreate,
        errors: [],
      });
    });

    it("trims IDs and preserves valid optional and nullable fields", () => {
      expect(
        validateTestSessionCreate({
          instrumentId: "  instrument-1  ",
          verificationContext: "SERVICE_INSPECTION",
          rulesetVersionId: "  ruleset-1 ",
          technicianId: " technician-1 ",
          status: "IN_PROGRESS",
          reviewerId: " reviewer-1 ",
          approverId: null,
          notes: "  Inspection notes  ",
          completedAt: " 2026-09-06T10:30:00.125Z ",
        }),
      ).toEqual({
        success: true,
        data: {
          instrumentId: "instrument-1",
          verificationContext: "SERVICE_INSPECTION",
          rulesetVersionId: "ruleset-1",
          technicianId: "technician-1",
          status: "IN_PROGRESS",
          reviewerId: "reviewer-1",
          approverId: null,
          notes: "Inspection notes",
          completedAt: "2026-09-06T10:30:00.125Z",
        },
        errors: [],
      });
    });

    it.each([
      "instrumentId",
      "verificationContext",
      "rulesetVersionId",
      "technicianId",
    ])("rejects a missing required %s", (field) => {
      const payload: Record<string, unknown> = { ...validCreate };
      delete payload[field];

      const result = validateTestSessionCreate(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({ field, message: "is required" });
    });

    it.each(["instrumentId", "rulesetVersionId", "technicianId"])(
      "rejects an empty or whitespace-only %s",
      (field) => {
        const result = validateTestSessionCreate({
          ...validCreate,
          [field]: "   ",
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContainEqual({
          field,
          message: "must not be empty",
        });
      },
    );

    it("rejects an invalid verification context", () => {
      const result = validateTestSessionCreate({
        ...validCreate,
        verificationContext: "ANNUAL_CHECK",
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.field).toBe("verificationContext");
    });

    it("rejects an invalid status", () => {
      const result = validateTestSessionCreate({
        ...validCreate,
        status: "COMPLETE",
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.field).toBe("status");
    });

    it("rejects wrong primitive types", () => {
      const result = validateTestSessionCreate({
        ...validCreate,
        instrumentId: 123,
        reviewerId: false,
        notes: [],
      });

      expect(result.success).toBe(false);
      expect(result.errors.map((error) => error.field)).toEqual([
        "instrumentId",
        "reviewerId",
        "notes",
      ]);
    });

    it("rejects an invalid completedAt value", () => {
      const result = validateTestSessionCreate({
        ...validCreate,
        completedAt: "not-a-date",
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.field).toBe("completedAt");
    });
  });

  describe("update", () => {
    it("accepts an empty partial update", () => {
      expect(validateTestSessionUpdate({})).toEqual({
        success: true,
        data: {},
        errors: [],
      });
    });

    it("accepts and trims a valid partial update", () => {
      expect(
        validateTestSessionUpdate({
          status: "PENDING_REVIEW",
          reviewerId: " reviewer-2 ",
          notes: null,
        }),
      ).toEqual({
        success: true,
        data: {
          status: "PENDING_REVIEW",
          reviewerId: "reviewer-2",
          notes: null,
        },
        errors: [],
      });
    });

    it("rejects an invalid partial-update enum", () => {
      const result = validateTestSessionUpdate({ status: "FINISHED" });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.field).toBe("status");
    });

    it("rejects an empty nullable ID when it is not null", () => {
      const result = validateTestSessionUpdate({ approverId: "  " });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: "approverId",
        message: "must not be empty",
      });
    });

    it("rejects invalid supplied fields without requiring omitted fields", () => {
      const result = validateTestSessionUpdate({
        technicianId: null,
        completedAt: 123,
      });

      expect(result.success).toBe(false);
      expect(result.errors.map((error) => error.field)).toEqual([
        "technicianId",
        "completedAt",
      ]);
    });

    it("rejects a non-object payload", () => {
      expect(validateTestSessionUpdate("invalid").success).toBe(false);
    });
  });
});
