import "@testing-library/jest-dom";

process.env.INTERNAL_JWT_SECRET ||= "test-jwt-secret-at-least-32-bytes-long-12345";
