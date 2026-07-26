# SunriseCITY Autonomy — overview

Internal tooling project — not a customer-facing business; no social content applicable.

The unattended daily-ops loop: local cron pushes the vault state to the SunriseCITY GitHub repo at 6:00am, a cloud routine (trig_01TqciP1emJw3opjVD6z66ox) runs at ~6:30am doing real research/strategy/content work for stale projects, and an 8:30am pull syncs its output back into this vault's approval queue. Nothing auto-posts or auto-spends — everything lands in "Waiting on you."

Key pieces: ~/SunriseCITY/scripts/push.sh, pull.sh, crontab entries, the routine at claude.ai/code/routines.
