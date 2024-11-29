#!/usr/bin/env node

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as cm from './correctnessMetric.js'
import { calculateGitHubLicenseMetric, calculateNpmLicenseMetric } from './License_Check.js';
import { log } from './logging.js';
import * as resp from './responsivenessMetric.js';
import * as ramp from './rampUpMetric.js';
import * as bm from './BusFactor.js';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { run } from 'node:test';

// Worker function to run calculations in a separate thread
const runWorker = (workerFile: string, data: any): Promise<any> => {
    console.log(`we are on worker ${workerFile}`)
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerFile, { workerData: data });
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
};

// Helper function to identify and parse URLs
const parseUrl = (urlString: string) => {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(urlString);
    } catch (error) {
        log(`Invalid URL: ${urlString}`, 1); // Info level
        return { type: 'invalid', url: urlString };
    }
    
    log(`Processing URL: ${urlString}`, 1); // Info level
    // Check if it's an npm URL
    if (parsedUrl.hostname === 'www.npmjs.com' || parsedUrl.hostname === 'npmjs.com') {
        const parts = parsedUrl.pathname.split('/').filter(Boolean); // Split by `/` and remove empty parts
        if (parts.length === 2 && parts[0] === 'package') {
            const packageName = parts[1];
            return { type: 'npm', packageName };
        }
    }
    
    // Check if it's a GitHub URL
    if (parsedUrl.hostname === 'www.github.com' || parsedUrl.hostname === 'github.com') {
        const parts = parsedUrl.pathname.split('/').filter(Boolean); // Split by `/` and remove empty parts
        if (parts.length >= 2) {
            const [owner, repo] = parts;
            return { type: 'github', owner, repo };
        }
    }

    log(`Unknown URL format: ${urlString}`, 1); // Info level
    // If URL doesn't match either pattern
    return { type: 'unknown', url: urlString };
};

// Main function for processing URLs
export const processUrl = async (url: string) => {
    const start = performance.now();

    const parsedUrl = parseUrl(url);
    let correctness: number;
    let correctness_latency: number;
    let licenseScore = 0;
    let licenseLatency = 0;
    let rampup = 0;
    let rampupLatency = 0;
    let responsiveness = 0;
    let responsivenessLatency = 0;
    let busFactor: number;
    let BusFactorLatency: number;
    let dependency:number;
    let dependencyLatency:number;
    let codeReview: number;
    let codeReviewLatency: number;

    if (parsedUrl.type === 'npm') {
        const [correctnessResult, licenseResult, responsivenessResult, rampUpResult, busFactorResult,dependencyMetric,codeReviewResult] = await Promise.all([
            runWorker('./dist/phase_1/workers/correctnessWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/licenseWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/responsivenessWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/rampUpWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/busFactorWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/dependencyWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
            runWorker('./dist/phase_1/workers/codeReviewWorker.js', { type: 'npm', packageName: parsedUrl.packageName }),
        ]);

        console.log("we are her after the first workers")
        correctness = correctnessResult.correctness;
        correctness_latency = correctnessResult.latency;
        licenseScore = licenseResult.score;
        licenseLatency = licenseResult.latency;
        rampup = rampUpResult.rampup; 
        rampupLatency = rampUpResult.latency;
        responsiveness = responsivenessResult.responsiveness;
        responsivenessLatency = responsivenessResult.latency;
        busFactor = busFactorResult.data.busFactor;
        BusFactorLatency = busFactorResult.data.latency;
        dependency=dependencyMetric.score
        dependencyLatency=dependencyMetric.latency
        codeReview=codeReviewResult.score
        codeReviewLatency=codeReviewResult.latency

    } else if (parsedUrl.type === 'github') {
        const [correctnessResult, licenseResult, ResponsivenessResult, RampUpResult, busFactorResult,dependencyMetric,codeReviewResult] = await Promise.all([
            runWorker('./dist/phase_1/workers/correctnessWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/licenseWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/responsivenessWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/rampUpWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/busFactorWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/dependencyWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
            runWorker('./dist/phase_1/workers/codeReviewWorker.js', { type: 'github', owner: parsedUrl.owner, repo: parsedUrl.repo }),
        ]);

        correctness = correctnessResult.correctness;
        correctness_latency = correctnessResult.latency;
        licenseScore = licenseResult.score;
        licenseLatency = licenseResult.latency;
        rampup = RampUpResult[0];
        rampupLatency = RampUpResult[1];
        responsiveness = ResponsivenessResult[0];
        responsivenessLatency = ResponsivenessResult[1];
        busFactor = busFactorResult.data.busFactor;
        BusFactorLatency = busFactorResult.data.latency;
        dependency=dependencyMetric.score
        dependencyLatency=dependencyMetric.latency
        codeReview=codeReviewResult.score
        codeReviewLatency=codeReviewResult.latency
        console.log(dependency)
    } else {
        log(`Unknown URL format: ${url}`, 1);
        return null;
    }

     if (correctness == -1) {
        log(`Error in correctness metric calculation: ${url}`, 1); // Info level
        return null;
    }

    const metrics = {
        RampUp: rampup,
        Correctness: correctness,
        BusFactor: busFactor,
        BusFactorLatency: Math.round(BusFactorLatency ) / 1000,  // Convert to seconds and round to 3 decimal places
        ResponsiveMaintainer: responsiveness,
        dependency:dependency,
        CodeReview:codeReview,
        ResponsiveMaintainer_Latency: Math.round(responsivenessLatency ) / 1000,  // Convert to seconds and round
        License: { 
            score: licenseScore, 
            latency: Math.round(licenseLatency ) / 1000  // Convert to seconds and round
        },
        CorrectnessLatency: Math.round(correctness_latency ) / 1000,  // Convert to seconds and round
        RampUp_Latency: Math.round(rampupLatency) / 1000, // Convert to seconds and round
        dependencyLatency:Math.round(dependencyLatency)/1000 ,
        codeReviewLatency:Math.round(codeReviewLatency)/1000
        
    };

    log(`Metrics calculated for ${url}: ${JSON.stringify(metrics)}`, 2); // Debug level

    // Calculate NetScore (weighted sum based on project requirements)
    const NetScore = (
        0.15 * metrics.RampUp +
        0.15 * metrics.Correctness +
        0.1 * metrics.BusFactor +
        0.2 * metrics.ResponsiveMaintainer +
        0.1 * metrics.License.score+
        0.1*metrics.dependency+
        0.1 * metrics.CodeReview
    );

    const NetScore_Latency = Math.max(metrics.BusFactorLatency + metrics.ResponsiveMaintainer_Latency + metrics.CorrectnessLatency 
        + metrics.RampUp_Latency + metrics.License.latency+metrics.codeReviewLatency+metrics.dependencyLatency)  ;

    return {
        URL: url,
        NetScore: NetScore,
        NetScore_Latency: NetScore_Latency,
        RampUp: metrics.RampUp,
        Correctness: metrics.Correctness,
        BusFactor: metrics.BusFactor,
        ResponsiveMaintainer: metrics.ResponsiveMaintainer,
        License: metrics.License.score,
        Dependency:metrics.dependencyLatency,
        CodeReview:metrics.CodeReview,
        RampUp_Latency: metrics.RampUp_Latency,
        Correctness_Latency: metrics.CorrectnessLatency,
        BusFactor_Latency: metrics.BusFactorLatency,
        ResponsiveMaintainer_Latency: metrics.ResponsiveMaintainer,
        License_Latency: metrics.License.latency,
        DependencyLatency:metrics.dependencyLatency,
        CodeReviewLatency:metrics.codeReviewLatency
        
    };
};
