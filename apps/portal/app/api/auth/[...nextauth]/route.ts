/** Auth.js mounts its own endpoints here — sign-in, callback, session, CSRF. */
import { handlers } from '../../../../lib/auth';

export const { GET, POST } = handlers;
