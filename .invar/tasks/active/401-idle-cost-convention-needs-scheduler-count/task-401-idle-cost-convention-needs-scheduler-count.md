# #401 — idle-cost convention: frame counter alone is not authoritative

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #393 bycatch (contract drift, measured)

project.conventions.md calls the complete-frame counter authoritative for
idle CPU, but the #380 probe and a #393 positive-control trial both showed
repeated no-op render REQUESTS consuming CPU while emitting ZERO complete
frames. #393 published animationFrameCadenceTimerCount at the scheduler
ownership seam. Update the convention: idle verdicts read the scheduler
ownership count BESIDE the frame counter; name both instruments and the
#380/#393 evidence.
