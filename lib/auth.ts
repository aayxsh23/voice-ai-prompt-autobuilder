import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/apiHandler';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Identity seam for the whole app. Today this resolves the single workspace user
 * (the app has no login yet); every route depends only on this function, so
 * wiring a real auth provider (Auth.js / Clerk) later is a one-file change here
 * rather than a change across every handler.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  let user = await prisma.user.findFirst({
    select: { id: true, email: true, name: true }
  });
  if (!user) {
    user = await prisma.user.create({
      data: { name: 'Default User', email: 'user@example.com' },
      select: { id: true, email: true, name: true }
    });
  }
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Ensures the current user owns `projectId`. Throws ApiError(404) if the project
 * doesn't exist, ApiError(403) if it belongs to someone else. Single-user today,
 * but enforced everywhere so multi-tenant auth is a drop-in later.
 */
export async function assertProjectOwner(projectId: string): Promise<void> {
  const [user, project] = await Promise.all([
    getCurrentUser(),
    prisma.promptProject.findUnique({ where: { id: projectId }, select: { userId: true } }),
  ]);
  if (!project) throw new ApiError(404, 'Project not found');
  if (project.userId !== user.id) throw new ApiError(403, 'Forbidden');
}

