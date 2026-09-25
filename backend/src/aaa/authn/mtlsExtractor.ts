/**
 * OpenClaw Gateway AAA Suite — Mutual TLS (mTLS) Certificate Extractor
 * Extracts client certificate fingerprints and SAN/CN from sockets and ingress headers.
 */

import { MTLSCertificateInfo } from '../types';
import { AAAConfig } from '../config';

export class MTLSExtractor {
    private config: AAAConfig;

    constructor(config: AAAConfig) {
        this.config = config;
    }

    /**
     * Extract mTLS certificate info from HTTP request headers or socket
     */
    public extractFromHeaders(headers: Headers): MTLSCertificateInfo | null {
        if (!this.config.mtlsEnabled) {
            return null;
        }

        const fingerprint = headers.get(this.config.mtlsCertFingerprintHeader.toLowerCase());
        const xfcc = headers.get(this.config.mtlsHeaderName.toLowerCase());

        if (!fingerprint && !xfcc) {
            return null;
        }

        let subjectCN = 'unknown';
        let subjectSAN = '';

        if (xfcc) {
            // Parse Subject from Envoy/NGINX XFCC header e.g. Subject="CN=client.company.com";
            const matchCN = xfcc.match(/Subject=".*?CN=([^,;"]+)/i);
            if (matchCN) subjectCN = matchCN[1];
            const matchSAN = xfcc.match(/SAN=([^;"]+)/i);
            if (matchSAN) subjectSAN = matchSAN[1];
        }

        return {
            fingerprint: fingerprint || 'unknown',
            subjectCN,
            subjectSAN
        };
    }
}
