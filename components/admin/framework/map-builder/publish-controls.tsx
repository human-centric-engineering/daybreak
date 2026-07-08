'use client';

/**
 * PublishControls (f-map-editor t-4) — the header cluster that promotes a map draft to
 * a new immutable version and opens the version history. Ports the orchestration
 * workflow-builder's publish UX (`publish-dialog.tsx` + toolbar) into the framework
 * tree: a **Publish** button opening a confirm dialog with an optional `changeSummary`
 * (max 500 chars, persisted on the new version row), plus a **History** button.
 *
 * Presentational + self-contained dialog state: it owns the dialog open state and the
 * summary input, but delegates the actual publish to `onPublish` (the parent owns the
 * canvas + API orchestration) and surfaces the parent's `publishing` / `errorMessage`.
 * Publish promotes the **saved draft**, mirroring the workflow builder — so it is only
 * enabled when a draft exists (`hasDraft`); an author saves, then publishes.
 */

import { useEffect, useState } from 'react';
import { Check, History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MAX_CHANGE_SUMMARY_CHARS = 500;

export interface PublishControlsProps {
  /** Whether there is a saved draft to promote. Gates the Publish button. */
  hasDraft: boolean;
  /** The version int that will be assigned on publish (display-only). */
  nextVersion: number;
  /** True while the publish request is in flight. */
  publishing: boolean;
  /** Publish error (e.g. the validation 400), rendered in the dialog. */
  errorMessage: string | null;
  /** Flash true briefly after a successful publish, for the "Published" indicator. */
  published: boolean;
  /** Promote the saved draft with an optional trimmed change summary. */
  onPublish: (changeSummary: string | undefined) => void | Promise<void>;
  /** Open the version-history dialog. */
  onOpenHistory: () => void;
}

export function PublishControls({
  hasDraft,
  nextVersion,
  publishing,
  errorMessage,
  published,
  onPublish,
  onOpenHistory,
}: PublishControlsProps) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');

  // Reset the input each time the dialog re-opens so a previous summary doesn't bleed
  // into the next publish.
  useEffect(() => {
    if (open) setSummary('');
  }, [open]);

  // Close the dialog once a publish succeeds (the parent flips `publishing` false and
  // flashes `published`); a publish that 400s keeps the dialog open to show the error.
  useEffect(() => {
    if (published) setOpen(false);
  }, [published]);

  const trimmed = summary.trim();
  const tooLong = trimmed.length > MAX_CHANGE_SUMMARY_CHARS;
  const charsLeft = MAX_CHANGE_SUMMARY_CHARS - trimmed.length;

  const handleConfirm = () => {
    if (tooLong || publishing) return;
    void onPublish(trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <>
      {published && (
        <span
          data-testid="map-published-indicator"
          className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"
        >
          <Check className="h-4 w-4" /> Published
        </span>
      )}
      <Button variant="outline" size="sm" data-testid="map-history-open" onClick={onOpenHistory}>
        <History className="mr-1.5 h-4 w-4" /> History
      </Button>
      <Button
        size="sm"
        data-testid="map-publish-open"
        onClick={() => setOpen(true)}
        disabled={!hasDraft}
      >
        Publish
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish draft</DialogTitle>
            <DialogDescription>
              Promotes the saved draft to <strong>version {nextVersion}</strong> and pins it live.
              The currently published version is preserved in the history and can be rolled back to.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="map-publish-summary">Change summary (optional)</Label>
            <Textarea
              id="map-publish-summary"
              data-testid="map-publish-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What changed in this version?"
              rows={3}
              disabled={publishing}
              aria-describedby="map-publish-summary-help"
            />
            <p
              id="map-publish-summary-help"
              className={'text-xs ' + (tooLong ? 'text-destructive' : 'text-muted-foreground')}
            >
              {tooLong
                ? `${-charsLeft} characters over the ${MAX_CHANGE_SUMMARY_CHARS} limit`
                : `${charsLeft} characters left`}
            </p>
          </div>

          {errorMessage && (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="map-publish-confirm"
              onClick={handleConfirm}
              disabled={publishing || tooLong}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
