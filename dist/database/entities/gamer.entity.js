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
exports.Gamer = void 0;
const typeorm_1 = require("typeorm");
let Gamer = class Gamer {
    id;
    userId;
    user;
    gameId;
    game;
    title;
    language;
    opensource;
    code;
    createdAt;
    updatedAt;
};
exports.Gamer = Gamer;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Gamer.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Gamer.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('User', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", Object)
], Gamer.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Gamer.prototype, "gameId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Game', { nullable: false, onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'gameId' }),
    __metadata("design:type", Object)
], Gamer.prototype, "game", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], Gamer.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], Gamer.prototype, "language", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean'),
    __metadata("design:type", Boolean)
], Gamer.prototype, "opensource", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { select: false }),
    __metadata("design:type", String)
], Gamer.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Gamer.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Gamer.prototype, "updatedAt", void 0);
exports.Gamer = Gamer = __decorate([
    (0, typeorm_1.Entity)(),
    (0, typeorm_1.Index)(['userId', 'gameId'])
], Gamer);
//# sourceMappingURL=gamer.entity.js.map