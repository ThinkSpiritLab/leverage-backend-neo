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
exports.Contest = void 0;
const typeorm_1 = require("typeorm");
let Contest = class Contest {
    id;
    allowDirectLogin;
    deviceBindType;
    consultantId;
    consultant;
    name;
    description;
    notification;
    registrationEndTime;
    startTime;
    endTime;
    penalty;
    public;
    scoreByPoint;
    openForRegistration;
    fullyFreeze;
    freezeTime;
    freezeTimeAfterEnd;
    enabledLanguageJSON;
    createdAt;
    updatedAt;
};
exports.Contest = Contest;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Contest.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('bool', { default: false }),
    __metadata("design:type", Boolean)
], Contest.prototype, "allowDirectLogin", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Contest.prototype, "deviceBindType", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Contest.prototype, "consultantId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('User'),
    (0, typeorm_1.JoinColumn)({ name: 'consultantId' }),
    __metadata("design:type", Object)
], Contest.prototype, "consultant", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], Contest.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { default: '' }),
    __metadata("design:type", String)
], Contest.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { default: '', length: 10240 }),
    __metadata("design:type", String)
], Contest.prototype, "notification", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true }),
    __metadata("design:type", Object)
], Contest.prototype, "registrationEndTime", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime'),
    __metadata("design:type", Date)
], Contest.prototype, "startTime", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime'),
    __metadata("design:type", Date)
], Contest.prototype, "endTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Contest.prototype, "penalty", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Contest.prototype, "public", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Contest.prototype, "scoreByPoint", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Contest.prototype, "openForRegistration", void 0);
__decorate([
    (0, typeorm_1.Column)('bool', { default: false, comment: '是否完全封榜（只能查看自己）' }),
    __metadata("design:type", Boolean)
], Contest.prototype, "fullyFreeze", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Contest.prototype, "freezeTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Contest.prototype, "freezeTimeAfterEnd", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true }),
    __metadata("design:type", Object)
], Contest.prototype, "enabledLanguageJSON", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Contest.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Contest.prototype, "updatedAt", void 0);
exports.Contest = Contest = __decorate([
    (0, typeorm_1.Entity)()
], Contest);
//# sourceMappingURL=contest.entity.js.map