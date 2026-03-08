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
exports.ContestUserProblem = void 0;
const typeorm_1 = require("typeorm");
let ContestUserProblem = class ContestUserProblem {
    contestId;
    contestUser;
    contestUserId;
    contestProblemId;
    sent;
    createdAt;
    updatedAt;
};
exports.ContestUserProblem = ContestUserProblem;
__decorate([
    (0, typeorm_1.PrimaryColumn)('int', { name: 'contestUserContestId' }),
    __metadata("design:type", Number)
], ContestUserProblem.prototype, "contestId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.ManyToOne)('ContestUser', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)([
        { name: 'contestUserContestId', referencedColumnName: 'contestId' },
        { name: 'contestUserUserId', referencedColumnName: 'userId' },
    ]),
    __metadata("design:type", Object)
], ContestUserProblem.prototype, "contestUser", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('int', { name: 'contestUserUserId' }),
    __metadata("design:type", Number)
], ContestUserProblem.prototype, "contestUserId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('int'),
    __metadata("design:type", Number)
], ContestUserProblem.prototype, "contestProblemId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ContestUserProblem.prototype, "sent", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ContestUserProblem.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ContestUserProblem.prototype, "updatedAt", void 0);
exports.ContestUserProblem = ContestUserProblem = __decorate([
    (0, typeorm_1.Entity)()
], ContestUserProblem);
//# sourceMappingURL=contest-user-problem.entity.js.map