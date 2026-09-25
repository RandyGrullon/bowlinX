import { Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { useMyMemberships } from '../lib/data';
import { lastLeague } from '../lib/league';
import { Loading } from '../components/ui';

/** Al abrir la app: la última liga que se usó en este teléfono (o la única), si no la lista de ligas. */
export default function HomePage() {
  const { user, loading } = useAuth();
  const memberships = useMyMemberships(user?.uid);
  if (loading || memberships.loading) return <Loading />;
  const last = lastLeague();
  const mine = memberships.data.map((m) => m.leagueId);
  if (last && (!user || mine.includes(last))) return <Navigate to={`/l/${last}`} replace />;
  if (mine.length === 1) return <Navigate to={`/l/${mine[0]}`} replace />;
  return <Navigate to="/ligas" replace />;
}
