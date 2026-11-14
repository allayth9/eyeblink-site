// node dev/test-s3sign.mjs — checks functions/_lib/s3.js against the AWS documentation's presigned-URL example
// ("Authenticating Requests: Using Query Parameters", GET examplebucket/test.txt, 24 May 2013, 86400 s).
import { presign } from "../functions/_lib/s3.js";
const url = await presign({ method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", region: "us-east-1",
  accessKey: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", date: new Date("2013-05-24T00:00:00Z"), expires: 86400 });
const want = "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404";
const got = new URL(url).searchParams.get("X-Amz-Signature");
console.log(got === want ? "OK  signature matches the AWS example" : "FAIL got " + got);
process.exit(got === want ? 0 : 1);
