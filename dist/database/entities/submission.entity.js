"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Submission = void 0;
const typeorm_1 = require("typeorm");
let Submission = class Submission {
    id;
    userId;
    user;
    problemId;
    problem;
    language;
    time;
    memory;
    misc;
    sus;
    status;
    judger;
    courseId;
    course;
    contestId;
    contest;
    rejudgeLogs;
    createdAt;
    updatedAt;
};
exports.Submission = Submission;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Submission.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Submission.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('User', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", Object)
], Submission.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Submission.prototype, "problemId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Problem', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'problemId' }),
    __metadata("design:type", Object)
], Submission.prototype, "problem", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Number)
], Submission.prototype, "language", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], Submission.prototype, "time", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], Submission.prototype, "memory", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('SubmissionMisc', (s) => s.submission, { cascade: true }),
    __metadata("design:type", Object)
], Submission.prototype, "misc", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Suspicion', (s) => s.submission, { cascade: true }),
    __metadata("design:type", Object)
], Submission.prototype, "sus", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Number)
], Submission.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 24, nullable: true }),
    __metadata("design:type", Object)
], Submission.prototype, "judger", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], Submission.prototype, "courseId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Course', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'courseId' }),
    __metadata("design:type", Object)
], Submission.prototype, "course", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], Submission.prototype, "contestId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Contest', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'contestId' }),
    __metadata("design:type", Object)
], Submission.prototype, "contest", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('RejudgeLog', (r) => r.submission),
    __metadata("design:type", Array)
], Submission.prototype, "rejudgeLogs", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Submission.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Submission.prototype, "updatedAt", void 0);
exports.Submission = Submission = __decorate([
    (0, typeorm_1.Entity)()
], Submission);
//# sourceMappingURL=submission.entity.js.map