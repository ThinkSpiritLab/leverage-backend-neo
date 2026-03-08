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
exports.RejudgeLog = void 0;
const typeorm_1 = require("typeorm");
let RejudgeLog = class RejudgeLog {
    id;
    submissionId;
    submission;
    status;
    judger;
    time;
    memory;
    judgeResult;
    compileErrorMsg;
    submittedAt;
    createdAt;
};
exports.RejudgeLog = RejudgeLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], RejudgeLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], RejudgeLog.prototype, "submissionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Submission', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'submissionId' }),
    __metadata("design:type", Object)
], RejudgeLog.prototype, "submission", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], RejudgeLog.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 24, nullable: true }),
    __metadata("design:type", Object)
], RejudgeLog.prototype, "judger", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], RejudgeLog.prototype, "time", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], RejudgeLog.prototype, "memory", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], RejudgeLog.prototype, "judgeResult", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], RejudgeLog.prototype, "compileErrorMsg", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime'),
    __metadata("design:type", Date)
], RejudgeLog.prototype, "submittedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], RejudgeLog.prototype, "createdAt", void 0);
exports.RejudgeLog = RejudgeLog = __decorate([
    (0, typeorm_1.Entity)()
], RejudgeLog);
//# sourceMappingURL=rejudge-log.entity.js.map