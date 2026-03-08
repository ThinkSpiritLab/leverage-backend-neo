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
exports.ContestProblem = void 0;
const typeorm_1 = require("typeorm");
let ContestProblem = class ContestProblem {
    contestId;
    contest;
    problemId;
    problem;
    weight;
    label;
    color;
    submits;
    accepts;
    createdAt;
    updatedAt;
};
exports.ContestProblem = ContestProblem;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ContestProblem.prototype, "contestId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Contest', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'contestId' }),
    __metadata("design:type", Object)
], ContestProblem.prototype, "contest", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ContestProblem.prototype, "problemId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.ManyToOne)('Problem', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'problemId' }),
    __metadata("design:type", Object)
], ContestProblem.prototype, "problem", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 1 }),
    __metadata("design:type", Number)
], ContestProblem.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.Column)('char', { length: 1, nullable: true }),
    __metadata("design:type", Object)
], ContestProblem.prototype, "label", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 20, nullable: true }),
    __metadata("design:type", Object)
], ContestProblem.prototype, "color", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { comment: '提交数', default: 0 }),
    __metadata("design:type", Number)
], ContestProblem.prototype, "submits", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { comment: '通过数', default: 0 }),
    __metadata("design:type", Number)
], ContestProblem.prototype, "accepts", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ContestProblem.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ContestProblem.prototype, "updatedAt", void 0);
exports.ContestProblem = ContestProblem = __decorate([
    (0, typeorm_1.Entity)()
], ContestProblem);
//# sourceMappingURL=contest-problem.entity.js.map