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
exports.ContestUser = void 0;
const typeorm_1 = require("typeorm");
let ContestUser = class ContestUser {
    contestId;
    contest;
    userId;
    user;
    passwordHash;
    room;
    seat;
    submits;
    accepts;
    wildcard;
    female;
    createdAt;
    updatedAt;
};
exports.ContestUser = ContestUser;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ContestUser.prototype, "contestId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Contest', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'contestId' }),
    __metadata("design:type", Object)
], ContestUser.prototype, "contest", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ContestUser.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.ManyToOne)('User', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", Object)
], ContestUser.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { name: 'password', select: false, nullable: true }),
    __metadata("design:type", Object)
], ContestUser.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true }),
    __metadata("design:type", Object)
], ContestUser.prototype, "room", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true }),
    __metadata("design:type", Object)
], ContestUser.prototype, "seat", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], ContestUser.prototype, "submits", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], ContestUser.prototype, "accepts", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], ContestUser.prototype, "wildcard", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], ContestUser.prototype, "female", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ContestUser.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ContestUser.prototype, "updatedAt", void 0);
exports.ContestUser = ContestUser = __decorate([
    (0, typeorm_1.Entity)()
], ContestUser);
//# sourceMappingURL=contest-user.entity.js.map