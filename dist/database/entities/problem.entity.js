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
exports.Problem = exports.ProblemStatus = void 0;
const typeorm_1 = require("typeorm");
var ProblemStatus;
(function (ProblemStatus) {
    ProblemStatus[ProblemStatus["PENDING"] = 0] = "PENDING";
    ProblemStatus[ProblemStatus["ACCEPTED"] = 1] = "ACCEPTED";
    ProblemStatus[ProblemStatus["REJECTED"] = 2] = "REJECTED";
})(ProblemStatus || (exports.ProblemStatus = ProblemStatus = {}));
let Problem = class Problem {
    id;
    prefix;
    logicId;
    title;
    content;
    source;
    timeLimit;
    memoryLimit;
    difficulty;
    cases;
    multiCases;
    submits;
    accepts;
    restricted;
    status;
    statusUpdatedAt;
    closed;
    createrId;
    creater;
    tags;
    spjId;
    spj;
    createdAt;
    updatedAt;
};
exports.Problem = Problem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Problem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 8, default: 'p' }),
    __metadata("design:type", String)
], Problem.prototype, "prefix", void 0);
__decorate([
    (0, typeorm_1.Column)('int'),
    __metadata("design:type", Number)
], Problem.prototype, "logicId", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], Problem.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], Problem.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], Problem.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)('int'),
    __metadata("design:type", Number)
], Problem.prototype, "timeLimit", void 0);
__decorate([
    (0, typeorm_1.Column)('int'),
    __metadata("design:type", Number)
], Problem.prototype, "memoryLimit", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { nullable: true }),
    __metadata("design:type", Number)
], Problem.prototype, "difficulty", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { comment: '测试文件数量', default: 1 }),
    __metadata("design:type", Number)
], Problem.prototype, "cases", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { comment: '是否为多组输入', default: false, nullable: true }),
    __metadata("design:type", Boolean)
], Problem.prototype, "multiCases", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { comment: '提交数', default: 0 }),
    __metadata("design:type", Number)
], Problem.prototype, "submits", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { comment: '通过数', default: 0 }),
    __metadata("design:type", Number)
], Problem.prototype, "accepts", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { comment: '限制访问', default: false }),
    __metadata("design:type", Boolean)
], Problem.prototype, "restricted", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: ProblemStatus.PENDING }),
    __metadata("design:type", Number)
], Problem.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], Problem.prototype, "statusUpdatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { comment: '禁止访问', default: true }),
    __metadata("design:type", Boolean)
], Problem.prototype, "closed", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Problem.prototype, "createrId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('User'),
    (0, typeorm_1.JoinColumn)({ name: 'createrId' }),
    __metadata("design:type", Object)
], Problem.prototype, "creater", void 0);
__decorate([
    (0, typeorm_1.ManyToMany)('Tag', { cascade: true }),
    (0, typeorm_1.JoinTable)(),
    __metadata("design:type", Array)
], Problem.prototype, "tags", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Problem.prototype, "spjId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Submission'),
    (0, typeorm_1.JoinColumn)({ name: 'spjId' }),
    __metadata("design:type", Object)
], Problem.prototype, "spj", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Problem.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Problem.prototype, "updatedAt", void 0);
exports.Problem = Problem = __decorate([
    (0, typeorm_1.Entity)(),
    (0, typeorm_1.Unique)(['prefix', 'logicId'])
], Problem);
//# sourceMappingURL=problem.entity.js.map