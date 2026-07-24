'use client';

// App shell for the Hiring Pipeline Tracker. Domain state lives in useHiringStore; transient view state (active job, overlay) in useBoardView.

import { useState } from 'react';
import { Flag, Plus } from 'lucide-react';
import {
  findUserIdByEmail,
  formatJobMeta,
  jobById,
  jobStats,
  liveCount,
  overdueForOwner,
  useHiringStore,
  type HiringState,
  type Notification
} from '@/lib/hiring';
import { Button } from '@/components/ui/button';
import { useBoardView } from './hooks/useBoardView';
import Board from './Board';
import DetailDrawer from './DetailDrawer';
import AddCandidateModal from './AddCandidateModal';
import NewJobModal from './NewJobModal';
import JobTraitsModal from './JobTraitsModal';
import JobTabs from './JobTabs';
import TopBar from './TopBar';
import { ACCOUNT_LINKS } from './UserMenu';
import NotificationBell from './NotificationBell';
import CandidateSearch from './CandidateSearch';
import { useNow } from './hooks/useNow';
import CsvMenu from './CsvMenu';
import ImportDialog from './ImportDialog';

export default function HiringApp({
  initial,
  userEmail,
  notifications = [],
  aiEnabled = false
}: {
  initial: HiringState;
  userEmail?: string | null;
  notifications?: Notification[];
  /** Whether the AI trait recommender is configured (server-derived). */
  aiEnabled?: boolean;
}) {
  const { state, actions } = useHiringStore(initial);
  const { activeJob, showRejected, overlay, actions: view } = useBoardView(
    state.jobs
  );
  // The Traits/JD editor is kept as local state, not folded into the overlay machine.
  const [editingTraits, setEditingTraits] = useState(false);
  // Shared clock for time-in-stage / overdue UI (null until mounted — see hook).
  const now = useNow();

  // The per-overlay render props, derived from the single overlay union.
  const openId = overlay.kind === 'detail' ? overlay.candidateId : null;
  const focusMessageId =
    overlay.kind === 'detail' ? overlay.focusMessageId : null;
  const addingCandidate = overlay.kind === 'addCandidate';
  const creatingJob = overlay.kind === 'newJob';
  const importing = overlay.kind === 'import';

  const job = jobById(state.jobs, activeJob) ?? state.jobs[0];

  // The logged-in user's id (matched by email) — defaults the feedback author.
  const currentUserId = findUserIdByEmail(state.users, userEmail);

  // Thin adapter so JobTabs keeps its (jobId) => number prop contract.
  const jobLiveCount = (jobId: number) => liveCount(state.candidates, jobId);

  // The signed-in owner's overdue candidates, surfaced in the notification bell (derived from the live clock).
  const stageAlerts =
    now == null || currentUserId == null
      ? []
      : overdueForOwner(
          state.candidates,
          state.stageWarnDays,
          currentUserId,
          now
        );

  const meta = formatJobMeta(
    job
      ? jobStats(state.candidates, job.id)
      : { live: 0, hired: 0, rejected: 0 },
    showRejected
  );

  return (
    <div className="relative flex h-[100dvh] w-full flex-col bg-background text-[14px] leading-[1.4] text-foreground antialiased [container-name:plan-preview] [container-type:inline-size]">
      <TopBar
        subtitle="Pipeline Tracker"
        userEmail={userEmail}
        navItems={[ACCOUNT_LINKS.settings, ACCOUNT_LINKS.members]}
        topRight={
          <NotificationBell
            notifications={notifications}
            stageAlerts={stageAlerts}
            onOpen={view.openFromNotification}
            onOpenAlert={view.openInJob}
          />
        }
      >
        <Button variant="appPrimary" onClick={view.openNewJob}>
          <Plus size={14} aria-hidden /> New job
        </Button>
        <JobTabs
          jobs={state.jobs}
          activeJob={activeJob}
          liveCount={jobLiveCount}
          onSelect={view.selectJob}
          onToggleStar={actions.setJobStarred}
          onDelete={actions.deleteJob}
        />
      </TopBar>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div>
          <h1 className="m-0 text-[17px] font-bold">
            {job?.title ?? 'No jobs yet'}
          </h1>
          <div className="text-[12px] text-muted-foreground">{meta}</div>
        </div>
        <CandidateSearch
          candidates={state.candidates}
          jobs={state.jobs}
          users={state.users}
          sources={state.sources}
          bands={state.bands}
          onSelect={view.openInJob}
        />
        <div className="min-w-0 flex-1" />
        <label className="inline-flex select-none items-center gap-[7px] text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            className="h-[15px] w-[15px] accent-primary"
            checked={showRejected}
            onChange={(e) => view.setShowRejected(e.target.checked)}
          />{' '}
          Show rejected
        </label>
        <CsvMenu state={state} onImport={view.openImport} />
        <Button
          variant="app"
          onClick={() => setEditingTraits(true)}
          disabled={!job}
          title="Choose the important traits scored on this job"
        >
          <Flag size={14} aria-hidden /> Traits{job ? ` · ${job.traits.length}` : ''}
        </Button>
        <Button
          variant="appPrimary"
          onClick={view.openAddCandidate}
          disabled={!job}
        >
          <Plus size={14} aria-hidden /> Add candidate
        </Button>
      </div>

      <Board
        state={state}
        actions={actions}
        activeJob={activeJob}
        showRejected={showRejected}
        now={now}
        onOpen={view.openFromBoard}
      />

      <DetailDrawer
        state={state}
        actions={actions}
        openId={openId}
        currentUserId={currentUserId}
        now={now}
        onClose={view.close}
        focusMessageId={focusMessageId}
      />

      {addingCandidate && job && (
        <AddCandidateModal
          jobTitle={job.title}
          users={state.users}
          sources={state.sources}
          bands={state.bands}
          onClose={view.close}
          onAdd={(name, source, owner, linkedinUrl, githubUrl, yearsExperience) =>
            actions.addCandidate(
              job.id,
              name,
              source,
              owner,
              linkedinUrl,
              githubUrl,
              yearsExperience
            )
          }
        />
      )}

      {creatingJob && (
        <NewJobModal
          aiEnabled={aiEnabled}
          onClose={view.close}
          onCreate={(title, description, traits) =>
            actions.createJob(title, description, traits, view.selectJob)
          }
        />
      )}

      {editingTraits && job && (
        <JobTraitsModal
          jobTitle={job.title}
          traits={job.traits}
          description={job.description ?? ''}
          aiEnabled={aiEnabled}
          onChange={(next) => actions.setJobTraits(job.id, next)}
          onReorder={(index, dir) => actions.reorderTrait(job.id, index, dir)}
          onDescriptionChange={(desc) =>
            actions.setJobDescription(job.id, desc)
          }
          onClose={() => setEditingTraits(false)}
        />
      )}

      {importing && (
        <ImportDialog
          state={state}
          currentUserId={currentUserId}
          onImport={actions.importCandidates}
          onClose={view.close}
        />
      )}
    </div>
  );
}
