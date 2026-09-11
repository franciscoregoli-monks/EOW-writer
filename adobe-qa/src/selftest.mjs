import { decodeBeaconUrl, flattenBeacon } from "./decodeBeacon.mjs";
import { compareCase } from "./compare.mjs";

const sample =
  "https://theclimatepledge.sc.omtrdc.net/b/ss/amznclimatepledgeproduction/1/JS-2.27.0-LGU4/s1?AQB=1&pageName=Home&g=https://www.theclimatepledge.com/?utm_source=linkedin&v41=linkedin&v42=social&v43=sustainability-report-paid&v44=carousel-slide-1&v45=sustainability-report-paid%7Csocial%7Clinkedin%7Ccarousel-slide-1%7Cnet-zero-2040&v46=net-zero-2040&v0=%25Tracking%20code%25";

const beacon = flattenBeacon(decodeBeaconUrl(sample));
const result = compareCase({
  expected: {
    dataLayer: { event: "pageload", userInteraction: { pageName: "Home" } },
    beacon: {
      reportSuite: "amznclimatepledgeproduction",
      pageName: "Home",
      eVar41: "linkedin",
      eVar45: "sustainability-report-paid|social|linkedin|carousel-slide-1|net-zero-2040",
    },
  },
  dataLayerEvents: [
    {
      event: "pageload",
      userInteraction: { pageName: "Home" },
    },
  ],
  beacons: [beacon],
});

if (!result.pass) {
  console.error(result.checks.filter((c) => !c.pass));
  throw new Error("expected unit comparison to pass");
}
if (!result.checks.some((c) => c.note?.includes("Placeholder"))) {
  throw new Error("expected placeholder warning");
}
console.log("unit ok");
