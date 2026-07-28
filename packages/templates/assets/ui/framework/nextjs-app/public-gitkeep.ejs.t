---
to: public/.gitkeep
---
# Keeps `public/` in git even when empty.
#
# Not cosmetic: the Dockerfile does `COPY --from=builder /app/public ./public`, which fails
# the image build if the directory does not exist. That failure appears only at image build
# time, long after `npm run build` succeeded locally.
