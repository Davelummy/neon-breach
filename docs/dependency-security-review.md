# Dependency security review

Status: approved targeted patches applied on `agent/community-foundation`. No merge, deployment or live-project access.

## Audit baseline

Installed-tree audit: 18 package findings, seven high and eleven moderate. Production-only audit: seven findings, two high and five moderate. Package-chain findings are not distinct vulnerability counts. No automatic or forced audit fix was applied.

## Production high findings

| Dependency | Installed | Proposed patched target | Current path and exposure |
| --- | --- | --- | --- |
| `@fastify/busboy` | 3.2.0 | 3.2.2 | Netlify Blobs -> dev-utils -> whatwg server/fetch -> multipart parser; also Firebase Admin dev dependency. No game multipart parsing/upload route found. |
| `image-size` | 2.0.2 | 2.0.4 | Netlify Blobs -> dev-utils -> image parser. No game server image-upload/dimension parsing path found. |

The two targets fit the existing parent dependency ranges (`^3.1.1` / `^3.0.0` and `^2.0.2`). Registry metadata was checked; no package files were changed by those checks. Busboy 3.2.2 addresses both reviewed denial-of-service advisories and the later [CRLF advisory](https://github.com/advisories/GHSA-gxm5-99cw-xjw9). image-size 2.0.2 is affected by [JXL/HEIF infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) and [ICNS infinite loops](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr); npm's advisory ranges end at 2.0.2.

Inspection evidence:

- All eight `netlify/functions/*.mjs` entrypoints were bundled locally using the installed esbuild with `write:false`, Node platform and metadata output. None of the bundle input lists contained busboy, image-size, Netlify dev-utils or OpenTelemetry.
- Functions import the main `@netlify/blobs` entrypoint, not `@netlify/blobs/server`. The latter imports the development HTTP server utilities.
- Request handlers use JSON/text parsing; no `formData()` or direct image-dimension parser call was found in game server/functions code.
- This is local build evidence, NOT proof of Netlify's deployed bundling/externalization or a comprehensive exploitability assessment. Packages remain in the production installation tree and should still be patched. Future upload/server paths could expose them.

Executed after approval: `npm update @fastify/busboy image-size --ignore-scripts`. Two installed packages changed: busboy is now 3.2.2 and image-size 2.0.4, including the deduplicated Firebase Admin path. Direct dependency ranges were not changed by this update. The larger branch lockfile delta also includes the previously approved Firebase development SDK installation; it is not all attributable to these two patches. No forced audit fix was used.

Post-patch audit: 16 package-chain findings (five high, eleven moderate) in the complete development tree. Production-only audit: five moderate, zero high or critical. Residual findings below remain unresolved; a nonzero audit exit is expected and is not a clean security certification.

## Remaining findings and decisions

- Firebase JS pulls `@grpc/grpc-js` 1.9.16 through `@firebase/firestore`'s `~1.9.0` constraint. Other Admin SDK paths already use 1.14.5. [Reviewed gRPC certificate-authentication advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j) affects versions below 1.13.6. Current usage is localhost emulator clients, not a public gRPC server; this lowers the observed attack exposure but does not make the advisory disappear. A narrowly scoped override to a patched 1.x release requires approval and compatibility tests because it crosses Firebase's declared minor range. Do not accept npm's suggested Firebase 9 downgrade.
- Netlify/OpenTelemetry pins core/resources/trace packages at 2.7.1. Core below 2.8.0 is affected by [unbounded baggage propagation allocation](https://github.com/advisories/GHSA-8988-4f7v-96qf). The local function bundles exclude this path. Prefer a reviewed upstream Netlify update or a consistent compatible telemetry-family override; do not arbitrarily update just one pinned component.
- `uuid` below 11.1.1 is reported through older gaxios, and Drizzle's internal esbuild chain has development-server exposure findings. Both require usage and API compatibility review. Do not blindly force UUID across majors or downgrade Drizzle to npm's suggested older major.

## Verification after approved upgrades

1. Confirm only approved package paths changed and parent constraints remain satisfied (`npm ls` / `npm explain`).
2. Re-run full and production-only npm audit; report residual findings rather than implying zero risk.
3. Run `npm test`, `npm run test:firebase`, `npm run build`, `npm run qa` and `git diff --check`.
4. Recheck local function bundle dependencies. Keep deployed artifact verification as a separate release gate.
5. Resolve or explicitly document remaining dependency risks before recommending a merge. No automatic merge, push or deployment is authorized.
