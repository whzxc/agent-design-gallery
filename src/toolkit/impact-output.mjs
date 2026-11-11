const present = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && (!Array.isArray(value) || value.length)));

function record(row, explain) {
  return present({ candidate: row.candidate, disposition: row.disposition,
    reasons: row.reasons.map(({ witness, ...reason }) => ({ ...reason, ...(explain && witness ? { witness: present(witness) } : {}) })),
    proof: row.proof ? present({ ...row.proof, projection: explain ? row.proof.projection : undefined }) : null,
    unassessedReasons: row.unassessedReasons });
}

// Witnesses and proof digests describe the first represented row, not a grouping boundary.
function identity(row) {
  const { proof, reasons, ...rest } = row;
  return { ...rest, ...(proof ? { proof: Object.fromEntries(Object.entries(proof).filter(([key]) => key !== 'projection')) } : {}),
    ...(reasons ? { reasons: reasons.map(({ witness, ...reason }) => reason) } : {}) };
}

function addCounts(target, next) {
  for (let i = 0; i < (target.reasons?.length ?? 0); i++) target.reasons[i].count += next.reasons[i].count;
}

/** Shared wire projection for ImpactData and the later ImpactSelection. */
export function groupImpactFrames(frames, { explain = false } = {}) {
  const groups = [], byIdentity = new Map();
  for (const frame of frames) {
    const rows = [], byRecord = new Map();
    for (const input of frame.themes) {
      const value = record(input, explain), key = JSON.stringify(identity(value));
      const same = byRecord.get(key);
      if (same) { same.themes.push(input.theme); addCounts(same, value); }
      else { const row = { themes: [input.theme], ...value }; rows.push(row); byRecord.set(key, row); }
    }
    const metadata = present({ source: frame.ref.source, status: frame.status, matchKind: frame.matchKind, matchCandidates: frame.matchCandidates });
    const key = JSON.stringify({ ...metadata, rows: rows.map(identity) });
    const same = byIdentity.get(key);
    if (same) {
      same.frames.push(frame.ref.frame);
      for (let i = 0; i < rows.length; i++) addCounts(same.rows[i], rows[i]);
    } else {
      const group = { ...metadata, frames: [frame.ref.frame], rows };
      groups.push(group); byIdentity.set(key, group);
    }
  }
  return groups;
}

export const impactFrameCount = groups => groups.reduce((count, group) => count + group.frames.length, 0);
