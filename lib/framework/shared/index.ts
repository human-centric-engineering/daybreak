/**
 * Shared framework primitives used across the modules, facilitation, and
 * data-slots domains: the one scoping vocabulary, the one read-access seam
 * (`canRead` / `subjectScope`), the admin-route path-param parsers, and the
 * Prisma write-error mapping.
 */
export * from '@/lib/framework/shared/scope';
export * from '@/lib/framework/shared/access';
export * from '@/lib/framework/shared/route-params';
export * from '@/lib/framework/shared/prisma-errors';
