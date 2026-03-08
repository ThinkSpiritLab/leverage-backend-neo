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
exports.SubmissionMisc = void 0;
const typeorm_1 = require("typeorm");
let SubmissionMisc = class SubmissionMisc {
    submissionId;
    submission;
    judgeResult;
    code;
    compileErrorMsg;
};
exports.SubmissionMisc = SubmissionMisc;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], SubmissionMisc.prototype, "submissionId", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Submission', (s) => s.misc, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'submissionId' }),
    __metadata("design:type", Object)
], SubmissionMisc.prototype, "submission", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], SubmissionMisc.prototype, "judgeResult", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], SubmissionMisc.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], SubmissionMisc.prototype, "compileErrorMsg", void 0);
exports.SubmissionMisc = SubmissionMisc = __decorate([
    (0, typeorm_1.Entity)()
], SubmissionMisc);
//# sourceMappingURL=submission-misc.entity.js.map